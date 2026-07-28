import { prisma } from '@worth-running/database';
import type { EventReminderStatus, EventReminderType } from '@worth-running/database';
import { chinaDateOnly } from '@worth-running/shared';
import { cloudDaysRemaining, reminderRuntimeConfigMatched } from './reminderRuntimeConfig.js';

const DAY_MS = 24 * 60 * 60 * 1000;

type ReminderEvent = {
  id: string;
  eventDate: Date;
  eventStartAt: Date | null;
  signupStatus: string;
  signupStartAt: Date | null;
  signupDeadline: Date | null;
  publishStatus: string;
  infoStatus: string;
  sourceLevel: string;
  changeAlerts?: Array<{ id: string }>;
};

export type ReminderOption = {
  type: EventReminderType;
  available: boolean;
  reason?: string;
  trigger?: 'signup_open' | 'signup_deadline_3d' | 'race_week_7d';
  scheduledAt?: Date | null;
};

export function canReactivateReminder(status?: string) {
  return status !== 'sent';
}

function chinaNineOnDate(date: Date) {
  return new Date(`${chinaDateOnly(date)}T01:00:00.000Z`);
}

function baseIssue(event: ReminderEvent, now: Date) {
  if (event.publishStatus !== 'published') return '赛事未公开发布';
  if (event.eventDate.getTime() <= now.getTime()) return '赛事已过期';
  if (event.infoStatus !== 'verified') return '赛事信息尚未人工核实';
  if (!['official', 'trusted'].includes(event.sourceLevel)) return '赛事缺少官方或可信来源';
  if (event.changeAlerts?.length) return '赛事信息正在复核';
  return null;
}

export function buildReminderOptions(event: ReminderEvent, now = new Date()): ReminderOption[] {
  const issue = baseIssue(event, now);
  if (issue) {
    return [
      { type: 'signup', available: false, reason: issue },
      { type: 'race_week', available: false, reason: issue },
    ];
  }

  let signup: ReminderOption;
  if (
    event.signupStatus === 'not_started' &&
    event.signupStartAt &&
    event.signupStartAt.getTime() > now.getTime()
  ) {
    signup = {
      type: 'signup',
      available: true,
      trigger: 'signup_open',
      scheduledAt: event.signupStartAt,
    };
  } else if (
    ['signup_open', 'closing_soon'].includes(event.signupStatus) &&
    event.signupDeadline &&
    event.signupDeadline.getTime() > now.getTime()
  ) {
    const target = new Date(chinaNineOnDate(event.signupDeadline).getTime() - 3 * DAY_MS);
    signup = {
      type: 'signup',
      available: true,
      trigger: 'signup_deadline_3d',
      scheduledAt: target < now ? now : target,
    };
  } else {
    signup = { type: 'signup', available: false, reason: '报名开始或截止时间待官方核实' };
  }

  const untilRace = event.eventStartAt ? event.eventStartAt.getTime() - now.getTime() : 0;
  const raceTarget = event.eventStartAt
    ? new Date(chinaNineOnDate(event.eventStartAt).getTime() - 7 * DAY_MS)
    : null;
  const race: ReminderOption = !event.eventStartAt
    ? { type: 'race_week', available: false, reason: '开赛时间待官方核实' }
    : untilRace <= DAY_MS
      ? { type: 'race_week', available: false, reason: '距离比赛不足 24 小时' }
      : {
          type: 'race_week',
          available: true,
          trigger: 'race_week_7d',
          scheduledAt: raceTarget! < now ? now : raceTarget,
        };
  return [signup, race];
}

export function reminderIssueCodes(event: ReminderEvent, now = new Date()) {
  const issue = baseIssue(event, now);
  if (issue) return ['event_not_reminder_ready'];
  const issues: string[] = [];
  if (event.signupStatus === 'not_started' && !event.signupStartAt) {
    issues.push('missing_signup_start_at');
  } else if (
    ['signup_open', 'closing_soon'].includes(event.signupStatus) &&
    !event.signupDeadline
  ) {
    issues.push('missing_signup_deadline');
  } else if (!['not_started', 'signup_open', 'closing_soon'].includes(event.signupStatus)) {
    issues.push('signup_not_active');
  }
  if (!event.eventStartAt) issues.push('missing_event_start_at');
  else if (event.eventStartAt.getTime() - now.getTime() <= DAY_MS) {
    issues.push('race_less_than_24h');
  }
  return issues;
}

export async function reminderOptionsForEvent(eventId: string, now = new Date()) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      eventDate: true,
      eventStartAt: true,
      signupStatus: true,
      signupStartAt: true,
      signupDeadline: true,
      publishStatus: true,
      infoStatus: true,
      sourceLevel: true,
      changeAlerts: { where: { status: 'open' }, take: 1, select: { id: true } },
    },
  });
  return event ? buildReminderOptions(event, now) : null;
}

export async function subscribeReminders(input: {
  userId: string;
  eventId: string;
  acceptedTypes: EventReminderType[];
  now?: Date;
}) {
  const options = await reminderOptionsForEvent(input.eventId, input.now);
  if (!options) throw new Error('赛事不存在');
  const selected = options.filter(
    (option) => input.acceptedTypes.includes(option.type) && option.available && option.trigger,
  );
  const reminders = [];
  for (const option of selected) {
    const existing = await prisma.eventReminder.findUnique({
      where: {
        userId_eventId_reminderType: {
          userId: input.userId,
          eventId: input.eventId,
          reminderType: option.type,
        },
      },
      select: { status: true },
    });
    if (!canReactivateReminder(existing?.status)) continue;
    reminders.push(
      await prisma.eventReminder.upsert({
        where: {
          userId_eventId_reminderType: {
            userId: input.userId,
            eventId: input.eventId,
            reminderType: option.type,
          },
        },
        create: {
          userId: input.userId,
          eventId: input.eventId,
          reminderType: option.type,
          trigger: option.trigger!,
          scheduledAt: option.scheduledAt ?? null,
        },
        update: {
          trigger: option.trigger!,
          scheduledAt: option.scheduledAt ?? null,
          status: 'pending',
          cancelledAt: null,
          lastErrorCode: null,
          attempts: 0,
          sentAt: null,
        },
      }),
    );
  }
  return { reminders, options };
}

export async function getReminderStats() {
  const grouped = await prisma.eventReminder.groupBy({ by: ['status'], _count: { _all: true } });
  return Object.fromEntries(grouped.map((row) => [row.status, row._count._all]));
}

export async function getReminderReadiness(now = new Date()) {
  const recentFailureSince = new Date(now.getTime() - DAY_MS);
  const [events, grouped, latestRun, overduePending, recentFailures] = await Promise.all([
    prisma.event.findMany({
      where: { publishStatus: 'published', eventDate: { gte: now } },
      select: {
        id: true,
        eventDate: true,
        eventStartAt: true,
        signupStatus: true,
        signupStartAt: true,
        signupDeadline: true,
        publishStatus: true,
        infoStatus: true,
        sourceLevel: true,
        changeAlerts: { where: { status: 'open' }, take: 1, select: { id: true } },
      },
      take: 200,
    }),
    prisma.eventReminder.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.reminderDeliveryRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    prisma.eventReminder.count({
      where: { status: 'pending', scheduledAt: { lt: now } },
    }),
    prisma.reminderDeliveryRun.count({
      where: {
        startedAt: { gte: recentFailureSince },
        status: { in: ['failed', 'partial'] },
      },
    }),
  ]);
  const options = events.map((event) => buildReminderOptions(event, now));
  const configured = Boolean(
    process.env.WX_SIGNUP_REMINDER_TEMPLATE_ID &&
    process.env.WX_RACE_REMINDER_TEMPLATE_ID &&
    process.env.WX_SIGNUP_REMINDER_EVENT_FIELD &&
    process.env.WX_SIGNUP_REMINDER_NOTICE_FIELD &&
    process.env.WX_SIGNUP_REMINDER_DATE_FIELD &&
    process.env.WX_RACE_REMINDER_EVENT_FIELD &&
    process.env.WX_RACE_REMINDER_NOTICE_FIELD &&
    process.env.WX_RACE_REMINDER_DATE_FIELD,
  );
  const enabled = process.env.REMINDER_FEATURE_ENABLED === 'true';
  const miniprogramState = process.env.WX_MINIPROGRAM_STATE || 'formal';
  const runtimeConfigMatched = reminderRuntimeConfigMatched();
  const remainingDays = cloudDaysRemaining();
  const latestRunAgeMinutes = latestRun
    ? Math.max(0, Math.floor((now.getTime() - latestRun.startedAt.getTime()) / 60_000))
    : null;
  const blockers: string[] = [];
  if (!configured) blockers.push('reminder_config_incomplete');
  if (!runtimeConfigMatched) blockers.push('runtime_config_mismatch');
  if (remainingDays === null || remainingDays < 30) blockers.push('unicloud_expiring');
  if (enabled && miniprogramState !== 'formal') blockers.push('formal_state_required');
  if (enabled && (latestRunAgeMinutes === null || latestRunAgeMinutes > 30)) {
    blockers.push('reminder_cron_stale');
  }
  if (overduePending > 0) blockers.push('overdue_pending');
  if (recentFailures > 0) blockers.push('recent_delivery_failure');
  return {
    configured,
    enabled,
    miniprogramState,
    environment: miniprogramState,
    runtimeConfigMatched,
    cloudDaysRemaining: remainingDays,
    eligibleEvents: options.filter((items) => items.some((item) => item.available)).length,
    signupEligibleEvents: options.filter(
      (items) => items.find((item) => item.type === 'signup')?.available,
    ).length,
    raceEligibleEvents: options.filter(
      (items) => items.find((item) => item.type === 'race_week')?.available,
    ).length,
    eligibleByType: {
      signup: options.filter((items) => items.find((item) => item.type === 'signup')?.available)
        .length,
      race_week: options.filter(
        (items) => items.find((item) => item.type === 'race_week')?.available,
      ).length,
    },
    missingEventStartAt: events.filter((event) => !event.eventStartAt).length,
    missingSignupTime: events.filter(
      (event) =>
        (event.signupStatus === 'not_started' && !event.signupStartAt) ||
        (['signup_open', 'closing_soon'].includes(event.signupStatus) && !event.signupDeadline),
    ).length,
    statuses: Object.fromEntries(grouped.map((row) => [row.status, row._count._all])),
    overduePending,
    recentFailures,
    latestRunAgeMinutes,
    healthStatus: blockers.length ? (enabled ? 'blocked' : 'warning') : 'healthy',
    blockers,
    latestRun,
  };
}

export async function listAdminReminders(input: {
  page: number;
  pageSize: number;
  status?: string;
  reminderType?: string;
  search?: string;
}) {
  const where = {
    ...(input.status ? { status: input.status as EventReminderStatus } : {}),
    ...(input.reminderType ? { reminderType: input.reminderType as EventReminderType } : {}),
    ...(input.search
      ? { event: { eventName: { contains: input.search, mode: 'insensitive' as const } } }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.eventReminder.findMany({
      where,
      select: {
        id: true,
        eventId: true,
        reminderType: true,
        trigger: true,
        status: true,
        scheduledAt: true,
        sentAt: true,
        attempts: true,
        lastErrorCode: true,
        createdAt: true,
        updatedAt: true,
        event: {
          select: {
            eventName: true,
            city: true,
            eventDate: true,
            eventStartAt: true,
            infoStatus: true,
            publishStatus: true,
          },
        },
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.eventReminder.count({ where }),
  ]);
  return { items, total, page: input.page, pageSize: input.pageSize };
}

export async function listReminderDeliveryRuns(input: { page: number; pageSize: number }) {
  const [items, total] = await Promise.all([
    prisma.reminderDeliveryRun.findMany({
      orderBy: { startedAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.reminderDeliveryRun.count(),
  ]);
  return { items, total, page: input.page, pageSize: input.pageSize };
}

export async function refreshPendingReminderSchedules(now = new Date()) {
  const reminders = await prisma.eventReminder.findMany({
    where: { status: 'pending' },
    include: {
      event: {
        include: { changeAlerts: { where: { status: 'open' }, take: 1, select: { id: true } } },
      },
    },
    orderBy: { updatedAt: 'asc' },
    take: 100,
  });
  for (const reminder of reminders) {
    const options = buildReminderOptions(reminder.event, now);
    if (reminder.trigger === 'signup_open') {
      const signupOption = options.find((item) => item.type === 'signup');
      if (!signupOption?.available) {
        await prisma.eventReminder.update({
          where: { id: reminder.id },
          data: { status: 'review_required', lastErrorCode: 'event_not_eligible' },
        });
      } else if (['signup_open', 'closing_soon'].includes(reminder.event.signupStatus)) {
        await prisma.eventReminder.update({
          where: { id: reminder.id },
          data: { scheduledAt: now },
        });
      }
      continue;
    }
    const expected = options.find((item) => item.type === reminder.reminderType);
    await prisma.eventReminder.update({
      where: { id: reminder.id },
      data: expected?.available
        ? { scheduledAt: expected.scheduledAt ?? null, lastErrorCode: null }
        : { status: 'review_required', lastErrorCode: 'event_not_eligible' },
    });
  }
  return { checked: reminders.length };
}

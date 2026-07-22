import { prisma } from '@worth-running/database';
import type { EventReminderType } from '@worth-running/database';
import { chinaDateOnly } from '@worth-running/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

type ReminderEvent = {
  id: string;
  eventDate: Date;
  signupStatus: string;
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
  if (event.signupStatus === 'not_started') {
    signup = { type: 'signup', available: true, trigger: 'signup_open', scheduledAt: null };
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
    signup = { type: 'signup', available: false, reason: '报名时间待官方核实' };
  }

  const raceTarget = new Date(chinaNineOnDate(event.eventDate).getTime() - 7 * DAY_MS);
  const untilRace = event.eventDate.getTime() - now.getTime();
  const race: ReminderOption =
    untilRace <= DAY_MS
      ? { type: 'race_week', available: false, reason: '距离比赛不足 24 小时' }
      : {
          type: 'race_week',
          available: true,
          trigger: 'race_week_7d',
          scheduledAt: raceTarget < now ? now : raceTarget,
        };
  return [signup, race];
}

export async function reminderOptionsForEvent(eventId: string, now = new Date()) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      eventDate: true,
      signupStatus: true,
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

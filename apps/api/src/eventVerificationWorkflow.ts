import { Prisma, prisma } from '@worth-running/database';
import { isNationwideDiscoveryEnabled, publishBoundaryError, resolveRegionForBoundary } from './dataPolicy.js';
import { resolveSupportedRegion } from '@worth-running/shared';
import { arePotentialDuplicateEvents } from './eventPublishWorkflow.js';
import { buildReminderOptions, reminderIssueCodes } from './reminderWorkflow.js';

type VerificationSummary = { status: string; staleAt: Date | null };
type VerificationAlert = { id: string };

export type VerificationEvent = {
  id: string;
  eventName: string;
  city: string;
  provinceCode?: string | null;
  cityCode?: string | null;
  eventDate: Date;
  eventStartAt: Date | null;
  distanceItems: string[];
  signupStatus: string;
  signupStartAt: Date | null;
  signupDeadline: Date | null;
  officialUrl: string;
  sourceName: string;
  sourceUrl: string | null;
  sourceLevel: string;
  publishStatus: string;
  infoStatus: string;
  fieldConfidence: unknown;
  updatedAt: Date;
  sourceSummaries: VerificationSummary[];
  changeAlerts: VerificationAlert[];
};

const verificationInclude = {
  sourceSummaries: {
    where: { status: 'published' as const },
    orderBy: { publishedAt: 'desc' as const },
    take: 1,
    select: { status: true, staleAt: true },
  },
  changeAlerts: {
    where: { status: 'open' as const },
    take: 1,
    select: { id: true },
  },
};

const criticalFields = [
  'eventName',
  'city',
  'provinceCode',
  'cityCode',
  'eventDate',
  'eventStartAt',
  'distanceItems',
  'signupStatus',
  'signupStartAt',
  'signupDeadline',
  'officialUrl',
  'sourceName',
  'sourceUrl',
  'sourceLevel',
] as const;

function comparable(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return JSON.stringify([...value].sort());
  return value ?? null;
}

export function criticalEventFieldsChanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  return criticalFields.some((field) => comparable(before[field]) !== comparable(after[field]));
}

export function eventVerificationIssues(event: VerificationEvent, now = new Date()) {
  const issues: string[] = [];
  if (event.publishStatus !== 'published') issues.push('event_not_published');
  const boundary = publishBoundaryError(
    event.city,
    event.eventDate.toISOString().slice(0, 10),
    now,
    { provinceCode: event.provinceCode, cityCode: event.cityCode },
  );
  if (boundary) {
    if (isNationwideDiscoveryEnabled()) {
      const region = resolveSupportedRegion(event.city);
      if (!region) issues.push('unsupported_region');
      else if (!event.provinceCode || !event.cityCode) issues.push('missing_region_code');
      else issues.push('region_code_mismatch');
    } else {
      issues.push(boundary);
    }
  }
  if (!['official', 'trusted'].includes(event.sourceLevel)) issues.push('source_not_trusted');
  if (!event.officialUrl) issues.push('missing_official_url');
  if (!event.sourceName) issues.push('missing_source_name');
  if (!event.sourceUrl) issues.push('missing_source_url');
  if (!event.distanceItems.length) issues.push('missing_distance_items');
  const summary = event.sourceSummaries[0];
  if (!summary) issues.push('missing_published_source_summary');
  else if (summary.staleAt) issues.push('source_summary_stale');
  if (event.changeAlerts.length) issues.push('open_change_alert');
  return [...new Set(issues)];
}

export function verifiedFieldConfidence(event: VerificationEvent) {
  const current =
    event.fieldConfidence &&
    typeof event.fieldConfidence === 'object' &&
    !Array.isArray(event.fieldConfidence)
      ? { ...(event.fieldConfidence as Record<string, unknown>) }
      : {};
  for (const field of criticalFields) {
    const value = event[field];
    if (
      value !== null &&
      value !== undefined &&
      value !== '' &&
      (!Array.isArray(value) || value.length)
    ) {
      current[field] = 'verified';
    }
  }
  return current;
}

export function reviewedReminderUpdate(
  reminderType: 'signup' | 'race_week',
  event: VerificationEvent,
  now = new Date(),
) {
  const option = buildReminderOptions(
    { ...event, infoStatus: 'verified', changeAlerts: [] },
    now,
  ).find((item) => item.type === reminderType);
  if (!option?.available || !option.trigger) return null;
  return {
    status: 'pending' as const,
    trigger: option.trigger,
    scheduledAt: option.scheduledAt ?? null,
    lastErrorCode: null,
    lockedAt: null,
    lockToken: null,
  };
}

export async function previewBulkVerify(eventIds: string[], now = new Date()) {
  const ids = [...new Set(eventIds)].slice(0, 20);
  const events = await prisma.event.findMany({
    where: { id: { in: ids } },
    include: verificationInclude,
  });
  const byId = new Map(events.map((event) => [event.id, event]));
  return ids.map((id) => {
    const event = byId.get(id);
    if (!event) {
      return { id, eventName: '', ready: false, issues: ['event_not_found'], updatedAt: null };
    }
    const issues = eventVerificationIssues(event, now);
    return {
      id,
      eventName: event.eventName,
      ready: issues.length === 0,
      issues,
      updatedAt: event.updatedAt.toISOString(),
    };
  });
}

export async function runBulkVerify(input: {
  eventIds: string[];
  dryRun: boolean;
  expected?: Array<{ id: string; updatedAt: string }>;
  note: string;
  adminUserId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const preview = await previewBulkVerify(input.eventIds, now);
  if (input.dryRun) return { dryRun: true, items: preview, verified: [], failed: [] };
  const expected = new Map((input.expected || []).map((item) => [item.id, item.updatedAt]));
  const verified: Array<{ id: string; eventName: string }> = [];
  const failed: Array<{ id: string; eventName: string; issues: string[] }> = [];

  for (const item of preview) {
    const snapshot = expected.get(item.id);
    if (!snapshot || snapshot !== item.updatedAt) {
      failed.push({ id: item.id, eventName: item.eventName, issues: ['preview_snapshot_changed'] });
      continue;
    }
    if (!item.ready) {
      failed.push({ id: item.id, eventName: item.eventName, issues: item.issues });
      continue;
    }
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const before = await tx.event.findUnique({
          where: { id: item.id },
          include: verificationInclude,
        });
        if (!before || before.updatedAt.toISOString() !== snapshot) {
          throw new Error('preview_snapshot_changed');
        }
        const issues = eventVerificationIssues(before, now);
        if (issues.length) throw new Error(issues.join(','));
        // 核验通过时顺带补齐缺失的省市行政区代码（城市可识别时），避免赛事因代码为空无法公开展示，
        // 也避免用户在无代码编辑入口的核验页陷入"补齐代码"死锁。
        const filledRegion = resolveRegionForBoundary(before.city, {
          provinceCode: before.provinceCode,
          cityCode: before.cityCode,
        });
        const event = await tx.event.update({
          where: { id: before.id },
          data: {
            infoStatus: 'verified',
            sourceCheckedAt: now,
            fieldConfidence: verifiedFieldConfidence(before) as Prisma.InputJsonValue,
            ...(!before.provinceCode && filledRegion.provinceCode
              ? { provinceCode: filledRegion.provinceCode }
              : {}),
            ...(!before.cityCode && filledRegion.cityCode
              ? { cityCode: filledRegion.cityCode }
              : {}),
          },
        });
        const reviewedReminders = await tx.eventReminder.findMany({
          where: { eventId: before.id, status: 'review_required' },
          select: { id: true, reminderType: true },
        });
        for (const reminder of reviewedReminders) {
          const data = reviewedReminderUpdate(reminder.reminderType, before, now);
          if (data) {
            await tx.eventReminder.update({ where: { id: reminder.id }, data });
          }
        }
        await tx.adminOperationLog.create({
          data: {
            adminUserId: input.adminUserId,
            action: 'event.verify',
            targetType: 'events',
            targetId: before.id,
            beforeValue: before as unknown as Prisma.InputJsonValue,
            afterValue: event as unknown as Prisma.InputJsonValue,
            note: input.note,
          },
        });
        return event;
      });
      verified.push({ id: updated.id, eventName: updated.eventName });
    } catch (error) {
      failed.push({
        id: item.id,
        eventName: item.eventName,
        issues: [error instanceof Error ? error.message : 'verification_failed'],
      });
    }
  }
  return { dryRun: false, items: preview, verified, failed };
}

export async function getEventVerificationPage(input: {
  page: number;
  pageSize: number;
  city?: string;
  issue?: string;
  reminderEligible?: boolean;
}) {
  const events = await prisma.event.findMany({
    where: {
      publishStatus: 'published',
      ...(input.city ? { city: input.city } : {}),
    },
    include: verificationInclude,
    orderBy: [{ eventDate: 'asc' }, { updatedAt: 'desc' }],
    take: 200,
  });
  const duplicateCandidates = new Map(
    events.map((event) => [
      event.id,
      events.filter((item) => arePotentialDuplicateEvents(event, item)),
    ]),
  );
  const score = (event: (typeof events)[number]) =>
    (event.sourceLevel === 'official' ? 20 : event.sourceLevel === 'trusted' ? 10 : 0) +
    (event.eventStartAt ? 4 : 0) +
    (event.signupStartAt ? 2 : 0) +
    (event.signupDeadline ? 2 : 0) +
    (event.sourceSummaries.length ? 3 : 0);
  const classified = events.map((event) => {
    const issues = eventVerificationIssues(event);
    const duplicates = duplicateCandidates.get(event.id) || [];
    if (duplicates.length) issues.push('duplicate_published_event');
    const group = [event, ...duplicates].sort(
      (left, right) => score(right) - score(left) || left.id.localeCompare(right.id),
    );
    const reminderOptions = buildReminderOptions(event);
    return {
      ...event,
      issues,
      ready: issues.length === 0,
      availableReminderTypes: reminderOptions
        .filter((option) => option.available)
        .map((option) => option.type),
      reminderIssues: reminderIssueCodes(event),
      duplicatePublishedWith: duplicates.map((item) => ({
        id: item.id,
        eventName: item.eventName,
      })),
      suggestedPrimaryId: duplicates.length ? group[0].id : null,
      reminderEligible:
        event.infoStatus === 'verified' &&
        issues.length === 0 &&
        reminderOptions.some((option) => option.available),
    };
  });
  const actionable = classified.filter(
    (event) => event.infoStatus !== 'verified' || event.issues.length > 0,
  );
  const baseRows = input.reminderEligible === undefined ? actionable : classified;
  const issueFiltered = input.issue
    ? baseRows.filter((event) => event.issues.includes(input.issue!))
    : baseRows;
  const filtered =
    input.reminderEligible === undefined
      ? issueFiltered
      : issueFiltered.filter((event) => event.reminderEligible === input.reminderEligible);
  const start = (input.page - 1) * input.pageSize;
  return {
    items: filtered.slice(start, start + input.pageSize),
    total: filtered.length,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function getEventVerificationSummary() {
  const events = await prisma.event.findMany({
    where: { publishStatus: 'published' },
    include: verificationInclude,
    take: 200,
  });
  const rows = events.map((event) => ({
    event,
    issues: eventVerificationIssues(event),
  }));
  const duplicatePairs = new Set<string>();
  for (const event of events) {
    for (const duplicate of events.filter((item) => arePotentialDuplicateEvents(event, item))) {
      duplicatePairs.add([event.id, duplicate.id].sort().join('|'));
    }
  }
  const actionable = rows.filter(
    ({ event, issues }) => event.infoStatus !== 'verified' || issues.length > 0,
  );
  return {
    pending: actionable.length,
    ready: actionable.filter(({ issues }) => issues.length === 0).length,
    missingSummary: rows.filter(({ issues }) => issues.includes('missing_published_source_summary'))
      .length,
    staleSummary: rows.filter(({ issues }) => issues.includes('source_summary_stale')).length,
    openAlerts: rows.filter(({ issues }) => issues.includes('open_change_alert')).length,
    reminderEligible: rows.filter(
      ({ event, issues }) =>
        event.infoStatus === 'verified' &&
        issues.length === 0 &&
        buildReminderOptions(event).some((option) => option.available),
    ).length,
    duplicatePublishedGroups: duplicatePairs.size,
  };
}

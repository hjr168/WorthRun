import { Prisma, prisma } from '@worth-running/database';
import type { SignupStatus } from '@worth-running/database';
import { buildPublicEventWhere, publishBoundaryError } from './dataPolicy.js';

export const eventChangeFields = [
  'eventDate',
  'distanceItems',
  'signupStatus',
  'signupDeadline',
  'officialUrl',
] as const;
export const eventChangeSignalFields = ['cancellationSignal', 'postponementSignal'] as const;
export type EventChangeField = (typeof eventChangeFields)[number];
export type EventChangeAction = 'apply_fields' | 'dismiss' | 'archive_event';

export class EventChangeNotFoundError extends Error {}
export class EventChangeConflictError extends Error {}
export class EventChangeResolutionError extends Error {}

export interface EventChangeAlertQuery {
  page?: number;
  pageSize?: number;
  status?: 'open' | 'applied' | 'dismissed' | 'archived_event' | 'superseded';
  severity?: 'normal' | 'important' | 'critical';
  changedField?: EventChangeField | (typeof eventChangeSignalFields)[number];
  search?: string;
}

export interface EventChangeResolutionInput {
  action: EventChangeAction;
  fields?: EventChangeField[];
  note: string;
}

export function buildEventChangeAlertWhere(
  query: Omit<EventChangeAlertQuery, 'page' | 'pageSize'>,
): Prisma.EventChangeAlertWhereInput {
  const where: Prisma.EventChangeAlertWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.severity) where.severity = query.severity;
  if (query.changedField) where.changedFields = { has: query.changedField };
  if (query.search) {
    where.OR = [
      { event: { eventName: { contains: query.search, mode: 'insensitive' } } },
      { source: { name: { contains: query.search, mode: 'insensitive' } } },
    ];
  }
  return where;
}

export async function listEventChangeAlerts(
  query: EventChangeAlertQuery,
  store: typeof prisma = prisma,
) {
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(query.pageSize ?? 20)));
  const where = buildEventChangeAlertWhere(query);
  const [items, total] = await Promise.all([
    store.eventChangeAlert.findMany({
      where,
      include: {
        event: true,
        source: { select: { id: true, name: true, sourceLevel: true, sourceType: true } },
      },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    store.eventChangeAlert.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getEventChangeAlertSummary(now = new Date(), store: typeof prisma = prisma) {
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monitoredPublishedWhere: Prisma.EventWhereInput = {
    ...buildPublicEventWhere(now),
    sourceLevel: { in: ['official', 'trusted'] },
  };
  const [open, critical, important, stalePublishedEvents, checkedWithin7Days, appliedWithin30Days] =
    await Promise.all([
      store.eventChangeAlert.count({ where: { status: 'open' } }),
      store.eventChangeAlert.count({ where: { status: 'open', severity: 'critical' } }),
      store.eventChangeAlert.count({ where: { status: 'open', severity: 'important' } }),
      store.event.count({
        where: {
          ...monitoredPublishedWhere,
          OR: [{ sourceCheckedAt: null }, { sourceCheckedAt: { lt: fourteenDaysAgo } }],
        },
      }),
      store.event.count({
        where: { ...monitoredPublishedWhere, sourceCheckedAt: { gte: sevenDaysAgo } },
      }),
      store.eventChangeAlert.count({
        where: { status: 'applied', reviewedAt: { gte: thirtyDaysAgo } },
      }),
    ]);
  return { open, critical, important, stalePublishedEvents, checkedWithin7Days, appliedWithin30Days };
}

const alertInclude = {
  event: true,
  source: { select: { id: true, name: true, sourceLevel: true } },
} satisfies Prisma.EventChangeAlertInclude;

type AlertWithEvent = Prisma.EventChangeAlertGetPayload<{ include: typeof alertInclude }>;

export async function previewEventChangeResolution(
  alertId: string,
  input: EventChangeResolutionInput,
  now = new Date(),
  store: typeof prisma = prisma,
) {
  const alert = await store.eventChangeAlert.findUnique({ where: { id: alertId }, include: alertInclude });
  if (!alert) throw new EventChangeNotFoundError('变更告警不存在');
  return previewFromAlert(alert, input, now);
}

function previewFromAlert(alert: AlertWithEvent, input: EventChangeResolutionInput, now: Date) {
  const issues: string[] = [];
  if (alert.status !== 'open') issues.push('alert_not_open');
  const after = asRecord(alert.afterValue);
  const before = asRecord(alert.beforeValue);
  const requestedFields = [...new Set(input.fields ?? [])];
  const changes: Record<string, { before: unknown; after: unknown }> = {};

  if (input.action === 'apply_fields') {
    if (!requestedFields.length) issues.push('fields_required');
    for (const field of requestedFields) {
      if (!eventChangeFields.includes(field)) {
        issues.push(`field_not_allowed:${field}`);
        continue;
      }
      if (!alert.changedFields.includes(field)) {
        issues.push(`field_not_changed:${field}`);
        continue;
      }
      if (isEmptySourceValue(after[field])) {
        issues.push(`empty_source_value:${field}`);
        continue;
      }
      changes[field] = { before: before[field], after: after[field] };
    }
    if (
      alert.changedFields.includes('postponementSignal') &&
      (!requestedFields.includes('eventDate') || isEmptySourceValue(after.eventDate))
    ) {
      issues.push('postponement_requires_new_date');
    }
    const proposed = applyValues(alert.event, changes);
    const boundary = publishBoundaryError(
      proposed.city,
      proposed.eventDate.toISOString().slice(0, 10),
      now,
    );
    if (boundary) issues.push(boundary);
    if (!proposed.distanceItems.length) issues.push('missing_distance_items');
    if (!proposed.signupStatus) issues.push('missing_signup_status');
    if (!proposed.officialUrl) issues.push('missing_official_url');
  } else if (input.action === 'archive_event') {
    if (alert.severity !== 'critical' || !alert.changedFields.includes('cancellationSignal')) {
      issues.push('archive_requires_critical_cancellation');
    }
  }

  return {
    alertId: alert.id,
    action: input.action,
    ready: issues.length === 0,
    issues: [...new Set(issues)],
    changes,
    event: {
      id: alert.event.id,
      eventName: alert.event.eventName,
      publishStatus: alert.event.publishStatus,
    },
    expected: {
      alertUpdatedAt: alert.updatedAt.toISOString(),
      eventUpdatedAt: alert.event.updatedAt.toISOString(),
    },
  };
}

export async function resolveEventChangeAlert(
  alertId: string,
  input: EventChangeResolutionInput & {
    expected: { alertUpdatedAt: string; eventUpdatedAt: string };
    adminUserId: string;
  },
  now = new Date(),
  store: typeof prisma = prisma,
) {
  if (input.note.trim().length < 4 || input.note.trim().length > 500) {
    throw new EventChangeResolutionError('处理备注需为 4-500 字');
  }
  return store.$transaction(async (tx) => {
    const alert = await tx.eventChangeAlert.findUnique({
      where: { id: alertId },
      include: alertInclude,
    });
    if (!alert) throw new EventChangeNotFoundError('变更告警不存在');
    if (
      alert.updatedAt.toISOString() !== input.expected.alertUpdatedAt ||
      alert.event.updatedAt.toISOString() !== input.expected.eventUpdatedAt
    ) {
      throw new EventChangeConflictError('告警或赛事已发生变化，请重新预览');
    }
    const preview = previewFromAlert(alert, input, now);
    if (!preview.ready) throw new EventChangeResolutionError(preview.issues.join(','));

    let updatedEvent = alert.event;
    if (input.action === 'apply_fields') {
      const data = eventUpdateData(preview.changes);
      updatedEvent = await tx.event.update({ where: { id: alert.event.id }, data });
    } else if (input.action === 'archive_event') {
      updatedEvent = await tx.event.update({
        where: { id: alert.event.id },
        data: { publishStatus: 'archived', archivedAt: now },
      });
    }

    const status =
      input.action === 'apply_fields'
        ? 'applied'
        : input.action === 'archive_event'
          ? 'archived_event'
          : 'dismissed';
    const updatedAlert = await tx.eventChangeAlert.update({
      where: { id: alert.id },
      data: {
        status,
        reviewedBy: input.adminUserId,
        reviewedAt: now,
        reviewNote: input.note.trim(),
      },
    });
    if (input.action !== 'dismiss') {
      await tx.eventChangeAlert.updateMany({
        where: {
          id: { not: alert.id },
          eventId: alert.eventId,
          sourceId: alert.sourceId,
          status: 'open',
        },
        data: { status: 'superseded', reviewedAt: now, reviewedBy: input.adminUserId },
      });
    }
    await tx.adminOperationLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: `event_change_alert.${input.action}`,
        targetType: 'event_change_alerts',
        targetId: alert.id,
        beforeValue: {
          alertId: alert.id,
          status: alert.status,
          eventId: alert.eventId,
          changedFields: alert.changedFields,
          selectedFields: input.fields ?? [],
          values: preview.changes,
        } as Prisma.InputJsonObject,
        afterValue: {
          alertId: updatedAlert.id,
          status: updatedAlert.status,
          eventId: updatedEvent.id,
          publishStatus: updatedEvent.publishStatus,
        },
        note: input.note.trim(),
      },
    });
    const remainingOpen = await tx.eventChangeAlert.count({
      where: { eventId: alert.eventId, status: 'open' },
    });
    return { alert: updatedAlert, event: updatedEvent, sourceReviewPending: remainingOpen > 0 };
  });
}

function asRecord(value: Prisma.JsonValue) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isEmptySourceValue(value: unknown) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && !value.trim()) ||
    (Array.isArray(value) && value.length === 0)
  );
}

function applyValues<T extends AlertWithEvent['event']>(
  event: T,
  changes: Record<string, { before: unknown; after: unknown }>,
) {
  return {
    ...event,
    eventDate: changes.eventDate
      ? new Date(`${String(changes.eventDate.after)}T00:00:00.000Z`)
      : event.eventDate,
    distanceItems: changes.distanceItems
      ? (changes.distanceItems.after as string[])
      : event.distanceItems,
    signupStatus: changes.signupStatus
      ? (changes.signupStatus.after as SignupStatus)
      : event.signupStatus,
    signupDeadline: changes.signupDeadline
      ? new Date(String(changes.signupDeadline.after))
      : event.signupDeadline,
    officialUrl: changes.officialUrl ? String(changes.officialUrl.after) : event.officialUrl,
  };
}

function eventUpdateData(changes: Record<string, { before: unknown; after: unknown }>) {
  const data: Prisma.EventUpdateInput = {};
  if (changes.eventDate) data.eventDate = new Date(`${String(changes.eventDate.after)}T00:00:00.000Z`);
  if (changes.distanceItems) data.distanceItems = changes.distanceItems.after as string[];
  if (changes.signupStatus) data.signupStatus = changes.signupStatus.after as SignupStatus;
  if (changes.signupDeadline) data.signupDeadline = new Date(String(changes.signupDeadline.after));
  if (changes.officialUrl) data.officialUrl = String(changes.officialUrl.after);
  return data;
}

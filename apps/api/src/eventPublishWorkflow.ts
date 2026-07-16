import { Prisma, prisma } from '@worth-running/database';
import { publishBoundaryError } from './dataPolicy.js';

export const publishRiskKeywords = ['取消', '延期', '疑似', '网传', '非官方'];

export interface PublishWorkflowEvent {
  id?: string;
  eventName: string;
  city: string;
  eventDate: Date | string;
  distanceItems: string[];
  signupStatus: string;
  officialUrl: string;
  sourceName: string;
  sourceUrl: string | null;
  sourceLevel: string;
  publishStatus?: string;
  infoStatus?: string;
  runJudgement: string;
  judgementSummary?: string | null;
  judgementReasons?: string[];
  updatedAt: Date;
  checklistItems?: unknown[];
}

export function eventPublishIssues(event: PublishWorkflowEvent, now = new Date()) {
  const issues: string[] = [];
  if (!event.eventName) issues.push('missing_event_name');
  if (!event.city) issues.push('missing_city');
  if (!event.eventDate) issues.push('missing_event_date');
  if (!event.distanceItems.length) issues.push('missing_distance_items');
  if (!event.signupStatus) issues.push('missing_signup_status');
  if (!event.officialUrl) issues.push('missing_official_url');
  if (!event.sourceName) issues.push('missing_source_name');
  if (!event.sourceUrl) issues.push('missing_source_url');
  if (!event.sourceLevel) issues.push('missing_source_level');
  if (!event.runJudgement) issues.push('missing_run_judgement');
  if (!event.judgementReasons?.length) issues.push('missing_judgement_reasons');
  if (!event.checklistItems?.length) issues.push('missing_checklist');
  if (event.infoStatus === 'user_flagged') issues.push('user_flagged');
  const date =
    event.eventDate instanceof Date ? event.eventDate.toISOString().slice(0, 10) : event.eventDate;
  const boundary = publishBoundaryError(event.city, date, now);
  if (boundary) issues.push(boundary);
  const text = [
    event.eventName,
    event.judgementSummary,
    event.officialUrl,
    event.sourceName,
    event.sourceUrl,
  ]
    .filter(Boolean)
    .join(' ');
  const keyword = publishRiskKeywords.find((item) => text.includes(item));
  if (keyword) issues.push(`risk_keyword:${keyword}`);
  return [...new Set(issues)];
}

export async function previewBulkPublish(eventIds: string[], now = new Date()) {
  const ids = [...new Set(eventIds)].slice(0, 20);
  const events = await prisma.event.findMany({
    where: { id: { in: ids } },
    include: { checklistItems: { orderBy: { sortOrder: 'asc' } } },
  });
  const byId = new Map(events.map((event) => [event.id, event]));
  return ids.map((id) => {
    const event = byId.get(id);
    if (!event)
      return { id, eventName: '', ready: false, issues: ['event_not_found'], updatedAt: null };
    const issues = eventPublishIssues(event, now);
    if (event.publishStatus !== 'draft') issues.push('event_not_draft');
    return {
      id,
      eventName: event.eventName,
      ready: issues.length === 0,
      issues,
      updatedAt: event.updatedAt.toISOString(),
    };
  });
}

export async function runBulkPublish(input: {
  eventIds: string[];
  dryRun: boolean;
  expected?: Array<{ id: string; updatedAt: string }>;
  adminUserId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const preview = await previewBulkPublish(input.eventIds, now);
  if (input.dryRun) return { dryRun: true, items: preview, published: [], failed: [] };
  const expected = new Map((input.expected || []).map((item) => [item.id, item.updatedAt]));
  const published: Array<{ id: string; eventName: string }> = [];
  const failed: Array<{ id: string; eventName: string; issues: string[] }> = [];

  for (const item of preview) {
    const expectedUpdatedAt = expected.get(item.id);
    if (!expectedUpdatedAt || expectedUpdatedAt !== item.updatedAt) {
      failed.push({ id: item.id, eventName: item.eventName, issues: ['preview_snapshot_changed'] });
      continue;
    }
    if (!item.ready) {
      failed.push({ id: item.id, eventName: item.eventName, issues: item.issues });
      continue;
    }
    try {
      const event = await prisma.$transaction(async (tx) => {
        const before = await tx.event.findUnique({
          where: { id: item.id },
          include: { checklistItems: true },
        });
        if (!before || before.updatedAt.toISOString() !== expectedUpdatedAt) {
          throw new Error('preview_snapshot_changed');
        }
        const issues = eventPublishIssues(before, now);
        if (before.publishStatus !== 'draft') issues.push('event_not_draft');
        if (issues.length) throw new Error(issues.join(','));
        const updated = await tx.event.update({
          where: { id: before.id },
          data: { publishStatus: 'published', publishedAt: now },
        });
        await tx.adminOperationLog.create({
          data: {
            adminUserId: input.adminUserId,
            action: 'event.bulk_publish',
            targetType: 'events',
            targetId: before.id,
            beforeValue: before as unknown as Prisma.InputJsonValue,
            afterValue: updated as unknown as Prisma.InputJsonValue,
            note: '批量预览确认后发布赛事',
          },
        });
        return updated;
      });
      published.push({ id: event.id, eventName: event.eventName });
    } catch (error) {
      failed.push({
        id: item.id,
        eventName: item.eventName,
        issues: [error instanceof Error ? error.message : 'publish_failed'],
      });
    }
  }
  return { dryRun: false, items: preview, published, failed };
}

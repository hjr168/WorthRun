import { Prisma, prisma } from '@worth-running/database';
import { chinaDateOnly, isGreaterBayAreaCity } from '@worth-running/shared';
import {
  classifyFeedbackRisk,
  isLowInformationFeedback,
  normalizeFeedbackContent,
} from './feedbackAbuse.js';

export interface FeedbackWorkflowItem {
  id: string;
  eventId: string | null;
  userKey: string | null;
  feedbackType: string;
  content: string;
  status: string;
  updatedAt: Date;
  createdAt: Date;
  event?: {
    id: string;
    eventName: string;
    city: string;
    eventDate: Date;
    publishStatus: string;
  } | null;
}

export function feedbackDuplicateKey(item: FeedbackWorkflowItem) {
  return [
    item.eventId || '',
    item.userKey || '',
    item.feedbackType,
    normalizeFeedbackContent(item.content),
  ].join('\u0000');
}

export function feedbackDisposition(item: FeedbackWorkflowItem, now: Date = new Date()) {
  const risk = classifyFeedbackRisk(item.content);
  const lowInformation = isLowInformationFeedback(item.feedbackType, item.content);
  const today = new Date(`${chinaDateOnly(now)}T00:00:00.000Z`);
  const eventScope =
    item.event?.publishStatus === 'published' &&
    item.event.eventDate > today &&
    isGreaterBayAreaCity(item.event.city)
      ? 'public'
      : 'unpublished';
  return {
    riskReason: risk.suspicious ? risk.reason : null,
    lowInformation,
    eventScope: eventScope as 'public' | 'unpublished',
  };
}

export function buildFeedbackSummary(
  items: FeedbackWorkflowItem[],
  blocked7d: number,
  blocked30d: number,
  now: Date = new Date(),
) {
  let suspicious = 0;
  let lowInformation = 0;
  let unpublishedEvent = 0;
  const actionable: FeedbackWorkflowItem[] = [];
  const eventCounts = new Map<string, { eventId: string | null; eventName: string; count: number }>();

  for (const item of items) {
    const disposition = feedbackDisposition(item, now);
    if (disposition.riskReason) suspicious += 1;
    else if (disposition.lowInformation) lowInformation += 1;
    else if (disposition.eventScope === 'unpublished') unpublishedEvent += 1;
    else actionable.push(item);
    const eventKey = item.eventId || 'unlinked';
    const current = eventCounts.get(eventKey) || {
      eventId: item.eventId,
      eventName: item.event?.eventName || '未关联赛事',
      count: 0,
    };
    current.count += 1;
    eventCounts.set(eventKey, current);
  }

  const buckets = new Map<string, number>();
  for (const item of actionable) {
    const key = feedbackDuplicateKey(item);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const exactDuplicates = Array.from(buckets.values()).reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );

  return {
    pending: items.length,
    actionable: Math.max(0, actionable.length - exactDuplicates),
    suspicious,
    lowInformation,
    unpublishedEvent,
    exactDuplicates,
    blocked7d,
    blocked30d,
    topEvents: Array.from(eventCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}

export async function previewFeedbackBulk(feedbackIds: string[], now = new Date()) {
  const ids = [...new Set(feedbackIds)].slice(0, 50);
  const records = await prisma.feedback.findMany({
    where: { id: { in: ids } },
    include: {
      event: {
        select: { id: true, eventName: true, city: true, eventDate: true, publishStatus: true },
      },
    },
  });
  const byId = new Map(records.map((item) => [item.id, item]));
  return ids.map((id) => {
    const item = byId.get(id);
    if (!item) return { id, ready: false, issues: ['feedback_not_found'], updatedAt: null };
    const issues = ['pending', 'handling'].includes(item.status) ? [] : ['feedback_not_pending'];
    return {
      id,
      ready: issues.length === 0,
      issues,
      updatedAt: item.updatedAt.toISOString(),
      feedbackType: item.feedbackType,
      eventName: item.event?.eventName || '未关联赛事',
      ...feedbackDisposition(item, now),
    };
  });
}

export async function runFeedbackBulk(input: {
  feedbackIds: string[];
  status: 'resolved' | 'rejected';
  adminNote: string;
  dryRun: boolean;
  expected?: Array<{ id: string; updatedAt: string }>;
  adminUserId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const preview = await previewFeedbackBulk(input.feedbackIds, now);
  if (input.dryRun) return { dryRun: true, items: preview, handled: [], failed: [] };
  const expected = new Map((input.expected || []).map((item) => [item.id, item.updatedAt]));

  return prisma.$transaction(async (tx) => {
    const handled: Array<{ id: string }> = [];
    const failed: Array<{ id: string; issues: string[] }> = [];
    for (const item of preview) {
      const expectedUpdatedAt = expected.get(item.id);
      if (!expectedUpdatedAt || expectedUpdatedAt !== item.updatedAt) {
        failed.push({ id: item.id, issues: ['preview_snapshot_changed'] });
        continue;
      }
      if (!item.ready) {
        failed.push({ id: item.id, issues: item.issues });
        continue;
      }
      const result = await tx.feedback.updateMany({
        where: {
          id: item.id,
          updatedAt: new Date(expectedUpdatedAt),
          status: { in: ['pending', 'handling'] },
        },
        data: {
          status: input.status,
          adminNote: input.adminNote,
          handledBy: input.adminUserId,
          handledAt: now,
        },
      });
      if (result.count === 1) handled.push({ id: item.id });
      else failed.push({ id: item.id, issues: ['preview_snapshot_changed'] });
    }
    await tx.adminOperationLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: 'feedback.bulk_handle',
        targetType: 'feedback',
        targetId: now.toISOString(),
        afterValue: { status: input.status, handled, failed } as Prisma.InputJsonValue,
        note: input.adminNote,
      },
    });
    return { dryRun: false, items: preview, handled, failed };
  });
}

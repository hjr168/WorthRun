import { Prisma, prisma } from '@worth-running/database';
import { chinaDateOnly, isGreaterBayAreaCity } from '@worth-running/shared';
import { normalizeFeedbackContent, publicFeedbackTypes } from './feedbackAbuse.js';

export const dataCleanupActions = [
  'reject_expired_candidates',
  'reject_outside_region_candidates',
  'archive_expired_events',
  'archive_outside_region_events',
  'reject_invalid_feedback',
  'reject_duplicate_feedback',
] as const;

export type DataCleanupAction = (typeof dataCleanupActions)[number];
export type DataCleanupCounts = Record<DataCleanupAction, number>;

interface CandidateSnapshot {
  id: string;
  eventName: string;
  city: string;
  eventDate: Date | null;
}

interface EventSnapshot {
  id: string;
  eventName: string;
  city: string;
  eventDate: Date;
}

interface FeedbackSnapshot {
  id: string;
  eventId: string | null;
  userKey: string | null;
  feedbackType: string;
  content: string;
  createdAt: Date;
}

export interface GovernanceSnapshot {
  candidates: CandidateSnapshot[];
  events: EventSnapshot[];
  feedback: FeedbackSnapshot[];
}

export interface DataCleanupPlan {
  ids: Record<DataCleanupAction, string[]>;
  counts: DataCleanupCounts;
  samples: Record<DataCleanupAction, string[]>;
}

export class DataCleanupConflictError extends Error {}

export function assertExpectedCleanupCounts(
  actions: DataCleanupAction[],
  expected: Partial<DataCleanupCounts>,
  actual: DataCleanupCounts,
) {
  for (const action of actions) {
    if (expected[action] !== actual[action]) {
      throw new DataCleanupConflictError(
        `${action} 数量已变化：预期 ${expected[action] ?? '未提供'}，实际 ${actual[action]}`,
      );
    }
  }
}

export function buildDataCleanupPlan(snapshot: GovernanceSnapshot, now: Date = new Date()) {
  const today = new Date(`${chinaDateOnly(now)}T00:00:00.000Z`);
  const ids: Record<DataCleanupAction, string[]> = {
    reject_expired_candidates: [],
    reject_outside_region_candidates: [],
    archive_expired_events: [],
    archive_outside_region_events: [],
    reject_invalid_feedback: [],
    reject_duplicate_feedback: [],
  };
  const labels = new Map<string, string>();

  for (const candidate of snapshot.candidates) {
    labels.set(candidate.id, `${candidate.eventName}（${candidate.city}）`);
    if (candidate.eventDate && candidate.eventDate <= today) {
      ids.reject_expired_candidates.push(candidate.id);
    } else if (!isGreaterBayAreaCity(candidate.city)) {
      ids.reject_outside_region_candidates.push(candidate.id);
    }
  }

  for (const event of snapshot.events) {
    labels.set(event.id, `${event.eventName}（${event.city}）`);
    if (event.eventDate <= today) {
      ids.archive_expired_events.push(event.id);
    } else if (!isGreaterBayAreaCity(event.city)) {
      ids.archive_outside_region_events.push(event.id);
    }
  }

  const validTypes = new Set<string>(publicFeedbackTypes);
  const validFeedback = snapshot.feedback.filter((item) => {
    labels.set(item.id, `${item.feedbackType}：${item.content.slice(0, 40)}`);
    if (validTypes.has(item.feedbackType)) return true;
    ids.reject_invalid_feedback.push(item.id);
    return false;
  });
  const duplicateBuckets = new Map<string, FeedbackSnapshot[]>();
  for (const item of validFeedback) {
    const key = [
      item.eventId || '',
      item.userKey || '',
      item.feedbackType,
      normalizeFeedbackContent(item.content),
    ].join('\u0000');
    duplicateBuckets.set(key, [...(duplicateBuckets.get(key) || []), item]);
  }
  for (const bucket of duplicateBuckets.values()) {
    bucket.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    ids.reject_duplicate_feedback.push(...bucket.slice(1).map((item) => item.id));
  }

  const counts = Object.fromEntries(
    dataCleanupActions.map((action) => [action, ids[action].length]),
  ) as DataCleanupCounts;
  const samples = Object.fromEntries(
    dataCleanupActions.map((action) => [
      action,
      ids[action].slice(0, 5).map((id) => labels.get(id) || id),
    ]),
  ) as Record<DataCleanupAction, string[]>;
  return { ids, counts, samples } satisfies DataCleanupPlan;
}

async function loadSnapshot(
  store: typeof prisma | Prisma.TransactionClient = prisma,
): Promise<GovernanceSnapshot> {
  const [candidates, events, feedback] = await Promise.all([
    store.eventCandidate.findMany({
      where: { status: { in: ['new', 'needs_review'] } },
      select: { id: true, eventName: true, city: true, eventDate: true },
    }),
    store.event.findMany({
      where: { publishStatus: 'published' },
      select: { id: true, eventName: true, city: true, eventDate: true },
    }),
    store.feedback.findMany({
      where: { status: { in: ['pending', 'handling'] } },
      select: {
        id: true,
        eventId: true,
        userKey: true,
        feedbackType: true,
        content: true,
        createdAt: true,
      },
    }),
  ]);
  return { candidates, events, feedback };
}

export async function getDataQualitySummary(now: Date = new Date()) {
  const snapshot = await loadSnapshot();
  const plan = buildDataCleanupPlan(snapshot, now);
  const futureGreaterBayAreaPublished = snapshot.events.filter(
    (event) =>
      event.eventDate > new Date(`${chinaDateOnly(now)}T00:00:00.000Z`) &&
      isGreaterBayAreaCity(event.city),
  ).length;
  return { futureGreaterBayAreaPublished, ...plan.counts };
}

export async function runDataCleanup(input: {
  actions: DataCleanupAction[];
  dryRun: boolean;
  expected?: Partial<DataCleanupCounts>;
  adminUserId?: string;
  now?: Date;
}) {
  const actions = [...new Set(input.actions)];
  const now = input.now ?? new Date();
  if (input.dryRun) {
    const plan = buildDataCleanupPlan(await loadSnapshot(), now);
    return selectCleanupResult(plan, actions, true);
  }
  if (!input.expected) throw new DataCleanupConflictError('应用治理前必须提供预期数量');

  return prisma.$transaction(async (tx) => {
    const plan = buildDataCleanupPlan(await loadSnapshot(tx), now);
    assertExpectedCleanupCounts(actions, input.expected || {}, plan.counts);

    const handledAt = now;
    await applyCandidateAction(
      tx,
      plan.ids.reject_expired_candidates,
      actions.includes('reject_expired_candidates'),
      '系统治理：比赛日期已过期',
      input.adminUserId,
      handledAt,
    );
    await applyCandidateAction(
      tx,
      plan.ids.reject_outside_region_candidates,
      actions.includes('reject_outside_region_candidates'),
      '系统治理：不属于粤港澳大湾区',
      input.adminUserId,
      handledAt,
    );
    await applyEventArchive(
      tx,
      plan.ids.archive_expired_events,
      actions.includes('archive_expired_events'),
      handledAt,
    );
    await applyEventArchive(
      tx,
      plan.ids.archive_outside_region_events,
      actions.includes('archive_outside_region_events'),
      handledAt,
    );
    await applyFeedbackAction(
      tx,
      plan.ids.reject_invalid_feedback,
      actions.includes('reject_invalid_feedback'),
      '系统治理：非法反馈类型',
      input.adminUserId,
      handledAt,
    );
    await applyFeedbackAction(
      tx,
      plan.ids.reject_duplicate_feedback,
      actions.includes('reject_duplicate_feedback'),
      '系统判定：重复提交',
      input.adminUserId,
      handledAt,
    );

    const result = selectCleanupResult(plan, actions, false);
    await tx.adminOperationLog.create({
      data: {
        adminUserId: input.adminUserId || null,
        action: 'data_quality.cleanup',
        targetType: 'data_quality',
        targetId: now.toISOString(),
        afterValue: result,
        note: `数据治理：${actions.join(',')}`,
      },
    });
    return result;
  });
}

function selectCleanupResult(plan: DataCleanupPlan, actions: DataCleanupAction[], dryRun: boolean) {
  return {
    dryRun,
    actions,
    counts: Object.fromEntries(actions.map((action) => [action, plan.counts[action]])),
    samples: Object.fromEntries(actions.map((action) => [action, plan.samples[action]])),
  };
}

async function applyCandidateAction(
  tx: Prisma.TransactionClient,
  ids: string[],
  enabled: boolean,
  rejectReason: string,
  adminUserId: string | undefined,
  reviewedAt: Date,
) {
  if (!enabled || ids.length === 0) return;
  await tx.eventCandidate.updateMany({
    where: { id: { in: ids }, status: { in: ['new', 'needs_review'] } },
    data: { status: 'rejected', rejectReason, reviewedBy: adminUserId, reviewedAt },
  });
}

async function applyEventArchive(
  tx: Prisma.TransactionClient,
  ids: string[],
  enabled: boolean,
  archivedAt: Date,
) {
  if (!enabled || ids.length === 0) return;
  await tx.event.updateMany({
    where: { id: { in: ids }, publishStatus: 'published' },
    data: { publishStatus: 'archived', archivedAt },
  });
}

async function applyFeedbackAction(
  tx: Prisma.TransactionClient,
  ids: string[],
  enabled: boolean,
  adminNote: string,
  adminUserId: string | undefined,
  handledAt: Date,
) {
  if (!enabled || ids.length === 0) return;
  await tx.feedback.updateMany({
    where: { id: { in: ids }, status: { in: ['pending', 'handling'] } },
    data: { status: 'rejected', adminNote, handledBy: adminUserId, handledAt },
  });
}

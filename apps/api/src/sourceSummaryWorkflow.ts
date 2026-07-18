import { Prisma, prisma } from '@worth-running/database';
import { buildPublicEventWhere } from './dataPolicy.js';
import { generateEventSourceSummary } from './sourceSummaryGeneration.js';

export class SourceSummaryNotFoundError extends Error {}
export class SourceSummaryConflictError extends Error {}
export class SourceSummaryValidationError extends Error {}

export async function createSourceSummaryDraft(eventId: string, adminUserId?: string) {
  const result = await generateEventSourceSummary(eventId, {
    findExisting: ({ eventId: identityEventId, contentHash, promptVersion }) =>
      prisma.eventSourceSummary.findUnique({
        where: {
          eventId_contentHash_promptVersion: {
            eventId: identityEventId,
            contentHash,
            promptVersion,
          },
        },
      }),
  });
  if ('existing' in result && result.existing) return result.existing;
  const generated = result.generated;
  const created = await prisma.eventSourceSummary.create({ data: generated });
  await prisma.adminOperationLog.create({
    data: {
      adminUserId,
      action: 'source_summary.generate_draft',
      targetType: 'event_source_summaries',
      targetId: created.id,
      afterValue: {
        eventId,
        summaryId: created.id,
        basis: created.basis,
        sourceUrl: created.sourceUrl,
        contentHash: created.contentHash,
        aiProvider: created.aiProvider,
        aiModel: created.aiModel,
      },
      note: '抓取来源并生成摘要草稿',
    },
  });
  return created;
}

export async function listSourceSummaries(eventId: string) {
  return prisma.eventSourceSummary.findMany({
    where: { eventId },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
  });
}

export async function updateSourceSummaryDraft(
  id: string,
  input: {
    summary: string;
    keyPoints: string[];
    limitations?: string | null;
    expectedUpdatedAt: string;
    adminUserId: string;
  },
) {
  const current = await prisma.eventSourceSummary.findUnique({ where: { id } });
  if (!current) throw new SourceSummaryNotFoundError('来源摘要不存在');
  if (current.status !== 'draft') throw new SourceSummaryValidationError('只能编辑草稿摘要');
  if (current.updatedAt.toISOString() !== input.expectedUpdatedAt) {
    throw new SourceSummaryConflictError('摘要已发生变化，请刷新后重试');
  }
  const updated = await prisma.eventSourceSummary.update({
    where: { id },
    data: {
      summary: input.summary.trim(),
      keyPoints: input.keyPoints.map((item) => item.trim()),
      limitations: input.limitations?.trim() || null,
      reviewedBy: input.adminUserId,
    },
  });
  await writeSummaryLog({
    adminUserId: input.adminUserId,
    action: 'source_summary.edit',
    targetId: id,
    beforeValue: summarySnapshot(current),
    afterValue: summarySnapshot(updated),
  });
  return updated;
}

export async function publishSourceSummary(
  id: string,
  input: { expectedUpdatedAt: string; note: string; adminUserId: string },
) {
  if (input.note.trim().length < 4 || input.note.trim().length > 500) {
    throw new SourceSummaryValidationError('发布备注需为 4-500 字');
  }
  return prisma.$transaction(async (tx) => {
    const current = await tx.eventSourceSummary.findUnique({ where: { id } });
    if (!current) throw new SourceSummaryNotFoundError('来源摘要不存在');
    if (current.status !== 'draft') throw new SourceSummaryValidationError('只能发布草稿摘要');
    if (current.updatedAt.toISOString() !== input.expectedUpdatedAt) {
      throw new SourceSummaryConflictError('摘要已发生变化，请刷新后重试');
    }
    const now = new Date();
    await tx.eventSourceSummary.updateMany({
      where: { eventId: current.eventId, status: 'published', id: { not: id } },
      data: { status: 'superseded' },
    });
    const published = await tx.eventSourceSummary.update({
      where: { id },
      data: {
        status: 'published',
        publishedAt: now,
        staleAt: null,
        reviewedBy: input.adminUserId,
      },
    });
    await tx.adminOperationLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: 'source_summary.publish',
        targetType: 'event_source_summaries',
        targetId: id,
        beforeValue: summarySnapshot(current) as Prisma.InputJsonObject,
        afterValue: summarySnapshot(published) as Prisma.InputJsonObject,
        note: input.note.trim(),
      },
    });
    return published;
  });
}

export async function getPublicSourceSummary(eventId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, ...buildPublicEventWhere() },
    select: { id: true, eventName: true, city: true, eventDate: true },
  });
  if (!event) throw new SourceSummaryNotFoundError('赛事不存在或未发布');
  const summary = await prisma.eventSourceSummary.findFirst({
    where: { eventId, status: 'published' },
    orderBy: { publishedAt: 'desc' },
  });
  if (!summary) throw new SourceSummaryNotFoundError('来源摘要尚未发布');
  if (!isHttpUrl(summary.sourceUrl)) {
    throw new SourceSummaryValidationError('来源摘要链接不可用');
  }
  return {
    event,
    sourceName: summary.sourceName,
    sourceUrl: summary.sourceUrl,
    sourceTitle: summary.sourceTitle,
    summary: summary.summary,
    keyPoints: summary.keyPoints,
    limitations: summary.limitations,
    basis: summary.basis,
    fetchedAt: summary.fetchedAt,
    generatedAt: summary.generatedAt,
    publishedAt: summary.publishedAt,
    stale: Boolean(summary.staleAt),
    staleAt: summary.staleAt,
    complianceNotice: 'AI 整理，仅供参考，报名以官方为准。',
  };
}

export async function sourceSummaryAvailability(eventIds: string[]) {
  if (!eventIds.length) return new Map<string, { stale: boolean }>();
  const summaries = await prisma.eventSourceSummary.findMany({
    where: { eventId: { in: eventIds }, status: 'published' },
    select: { eventId: true, staleAt: true },
    orderBy: { publishedAt: 'desc' },
  });
  const result = new Map<string, { stale: boolean }>();
  for (const item of summaries) {
    if (!result.has(item.eventId)) result.set(item.eventId, { stale: Boolean(item.staleAt) });
  }
  return result;
}

function summarySnapshot(value: {
  status: string;
  summary: string;
  keyPoints: string[];
  limitations: string | null;
  updatedAt: Date;
}) {
  return {
    status: value.status,
    summary: value.summary,
    keyPoints: value.keyPoints,
    limitations: value.limitations,
    updatedAt: value.updatedAt.toISOString(),
  };
}

async function writeSummaryLog(input: {
  adminUserId: string;
  action: string;
  targetId: string;
  beforeValue: Record<string, unknown>;
  afterValue: Record<string, unknown>;
}) {
  await prisma.adminOperationLog.create({
    data: {
      adminUserId: input.adminUserId,
      action: input.action,
      targetType: 'event_source_summaries',
      targetId: input.targetId,
      beforeValue: input.beforeValue as Prisma.InputJsonObject,
      afterValue: input.afterValue as Prisma.InputJsonObject,
    },
  });
}

function isHttpUrl(value: string) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

import { Prisma, prisma } from '@worth-running/database';
import { aiEventCandidateSchema } from './ai/eventCandidateSchema.js';
import { classifyCandidate } from './ai/eventSourceOperations.js';

interface BackfillCandidate {
  id: string;
  status: string;
  sourceUrl: string | null;
  officialUrl: string | null;
  extractedData: unknown;
  duplicateEventId: string | null;
  source: { sourceLevel: string } | null;
}

export function buildConfirmationLinkBackfillPlan(items: BackfillCandidate[], now = new Date()) {
  return items.flatMap((item) => {
    if (!['new', 'needs_review'].includes(item.status)) return [];
    if (item.source?.sourceLevel !== 'official' || item.officialUrl || !item.sourceUrl) return [];
    const parsed = aiEventCandidateSchema.safeParse(item.extractedData);
    if (!parsed.success || parsed.data.officialUrl) return [];
    const extractedData = {
      ...parsed.data,
      officialUrl: item.sourceUrl,
      sourceLevel: 'official' as const,
    };
    const classification = classifyCandidate(extractedData, now, item.duplicateEventId);
    return [{ id: item.id, officialUrl: item.sourceUrl, extractedData, classification }];
  });
}

export async function runCandidateConfirmationBackfill(options: {
  dryRun: boolean;
  expected?: number;
  now?: Date;
}) {
  const now = options.now ?? new Date();
  const loadPlan = async (store: Prisma.TransactionClient | typeof prisma) => {
    const items = await store.eventCandidate.findMany({
      where: {
        status: { in: ['new', 'needs_review'] },
        officialUrl: null,
        sourceUrl: { not: null },
        source: { sourceLevel: 'official' },
      },
      include: { source: { select: { sourceLevel: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return buildConfirmationLinkBackfillPlan(items, now);
  };

  const previewPlan = await loadPlan(prisma);
  const preview = {
    dryRun: options.dryRun,
    count: previewPlan.length,
    samples: previewPlan.slice(0, 8).map((item) => item.id),
  };
  if (options.dryRun) return preview;
  if (options.expected === undefined) throw new Error('--apply 必须提供 --expected');
  if (options.expected !== previewPlan.length) {
    throw new Error(`预期数量不一致：expected=${options.expected}，当前=${previewPlan.length}`);
  }

  await prisma.$transaction(async (tx) => {
    const plan = await loadPlan(tx);
    if (plan.length !== options.expected) {
      throw new Error(`数据已变化：expected=${options.expected}，事务内=${plan.length}`);
    }
    for (const item of plan) {
      await tx.eventCandidate.update({
        where: { id: item.id },
        data: {
          officialUrl: item.officialUrl,
          extractedData: item.extractedData as Prisma.InputJsonObject,
          priorityScore: item.classification.priorityScore,
          reviewIssues: item.classification.reviewIssues,
        },
      });
    }
    await tx.adminOperationLog.create({
      data: {
        action: 'event_candidate.backfill_confirmation_links',
        targetType: 'event_candidates',
        afterValue: { count: plan.length, ids: plan.map((item) => item.id) },
        note: `以官方来源依据补充 ${plan.length} 条候选确认入口`,
      },
    });
  });
  return preview;
}

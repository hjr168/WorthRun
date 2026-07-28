import { Prisma, prisma } from '@worth-running/database';
import { arePotentialDuplicateEvents } from './eventPublishWorkflow.js';

export class DuplicateEventGovernanceError extends Error {}

type ExpectedDuplicateArchive = {
  primaryUpdatedAt: string;
  duplicateUpdatedAt: string;
  related: DuplicateRelatedCounts;
};

export type DuplicateRelatedCounts = {
  favorites: number;
  choices: number;
  reminders: number;
  feedback: number;
  shares: number;
  interactions: number;
  sourceSummaries: number;
};

async function loadPair(
  primaryId: string,
  duplicateId: string,
  store: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const [primary, duplicate] = await Promise.all([
    store.event.findUnique({ where: { id: primaryId } }),
    store.event.findUnique({ where: { id: duplicateId } }),
  ]);
  if (!primary || !duplicate) throw new DuplicateEventGovernanceError('主赛事或重复赛事不存在');
  if (primary.id === duplicate.id)
    throw new DuplicateEventGovernanceError('主赛事与重复赛事不能相同');
  if (primary.publishStatus !== 'published' || duplicate.publishStatus !== 'published') {
    throw new DuplicateEventGovernanceError('两条赛事都必须处于已发布状态');
  }
  if (!arePotentialDuplicateEvents(primary, duplicate)) {
    throw new DuplicateEventGovernanceError('两条赛事不符合重复赛事规则');
  }
  return { primary, duplicate };
}

async function relatedCounts(
  eventId: string,
  store: typeof prisma | Prisma.TransactionClient = prisma,
): Promise<DuplicateRelatedCounts> {
  const [favorites, choices, reminders, feedback, shares, interactions, sourceSummaries] =
    await Promise.all([
      store.userFavorite.count({ where: { eventId } }),
      store.userEventChoice.count({ where: { eventId } }),
      store.eventReminder.count({ where: { eventId } }),
      store.feedback.count({ where: { eventId } }),
      store.shareRecord.count({ where: { eventId } }),
      store.eventInteraction.count({ where: { eventId } }),
      store.eventSourceSummary.count({ where: { eventId } }),
    ]);
  return { favorites, choices, reminders, feedback, shares, interactions, sourceSummaries };
}

function sameCounts(left: DuplicateRelatedCounts, right: DuplicateRelatedCounts) {
  return (Object.keys(left) as Array<keyof DuplicateRelatedCounts>).every(
    (key) => left[key] === right[key],
  );
}

export async function archiveDuplicatePublishedEvent(input: {
  primaryId: string;
  duplicateId: string;
  dryRun: boolean;
  expected?: ExpectedDuplicateArchive;
  adminUserId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.dryRun) {
    const { primary, duplicate } = await loadPair(input.primaryId, input.duplicateId);
    return {
      dryRun: true,
      primary: { id: primary.id, eventName: primary.eventName, updatedAt: primary.updatedAt },
      duplicate: {
        id: duplicate.id,
        eventName: duplicate.eventName,
        updatedAt: duplicate.updatedAt,
      },
      related: await relatedCounts(duplicate.id),
    };
  }
  if (!input.expected) {
    throw new DuplicateEventGovernanceError('应用治理前必须提供 dry-run 快照');
  }
  return prisma.$transaction(async (tx) => {
    const { primary, duplicate } = await loadPair(input.primaryId, input.duplicateId, tx);
    const related = await relatedCounts(duplicate.id, tx);
    if (
      primary.updatedAt.toISOString() !== input.expected?.primaryUpdatedAt ||
      duplicate.updatedAt.toISOString() !== input.expected?.duplicateUpdatedAt ||
      !sameCounts(related, input.expected.related)
    ) {
      throw new DuplicateEventGovernanceError('赛事或关联数据已变化，请重新预览');
    }
    if (
      related.favorites ||
      related.choices ||
      related.reminders ||
      related.feedback ||
      related.shares
    ) {
      throw new DuplicateEventGovernanceError('重复赛事存在用户关联数据，需要人工迁移后再归档');
    }
    const archived = await tx.event.update({
      where: { id: duplicate.id },
      data: { publishStatus: 'archived', archivedAt: now },
    });
    await tx.adminOperationLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: 'data_quality.archive_duplicate_published_event',
        targetType: 'events',
        targetId: duplicate.id,
        beforeValue: { duplicate, related } as unknown as Prisma.InputJsonValue,
        afterValue: {
          duplicateId: duplicate.id,
          primaryId: primary.id,
          publishStatus: archived.publishStatus,
          archivedAt: archived.archivedAt,
        } as Prisma.InputJsonValue,
        note: `重复赛事归档，保留主赛事 ${primary.id}`,
      },
    });
    return {
      dryRun: false,
      primary: { id: primary.id, eventName: primary.eventName },
      duplicate: { id: archived.id, eventName: archived.eventName },
      related,
    };
  });
}

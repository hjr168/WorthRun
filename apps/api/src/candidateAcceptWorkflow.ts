import { Prisma, prisma } from '@worth-running/database';
import type { InfoStatus, RunJudgement, SignupStatus, SourceLevel } from '@worth-running/database';
import { aiEventCandidateSchema } from './ai/eventCandidateSchema.js';
import {
  buildCandidateDuplicateGroups,
  candidateAcceptIssues,
  type CandidateWorkflowItem,
} from './candidateWorkflow.js';

const fallbackChecklist = [
  ['报名信息', '报名截止与是否抽签'],
  ['领物安排', '领物时间、地点、证件要求'],
  ['交通安排', '起终点交通、存包和接驳'],
  ['装备', '号码布、芯片、跑鞋、补给'],
  ['风险提示', '天气变化和赛事变更公告'],
].map(([groupName, itemName], index) => ({
  groupName,
  itemName,
  itemStatus: 'pending_verify' as InfoStatus,
  sortOrder: index + 1,
}));

type ChecklistItem = (typeof fallbackChecklist)[number];
type ChecklistTemplates = Record<string, ChecklistItem[]>;

export async function previewBulkAccept(candidateIds: string[], now = new Date()) {
  const ids = [...new Set(candidateIds)].slice(0, 20);
  const [items, pendingItems] = await Promise.all([
    prisma.eventCandidate.findMany({
      where: { id: { in: ids } },
      include: { source: true },
    }),
    prisma.eventCandidate.findMany({
      where: { status: { in: ['new', 'needs_review'] }, eventDate: { not: null } },
      include: { source: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    }),
  ]);
  const duplicateIds = new Set(
    buildCandidateDuplicateGroups(pendingItems).flatMap((group) =>
      group.items.map((item) => item.id),
    ),
  );
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.map((id) => {
    const item = byId.get(id);
    if (!item)
      return { id, eventName: '', ready: false, issues: ['candidate_not_found'], updatedAt: null };
    const issues = candidateAcceptIssues(item, now);
    if (duplicateIds.has(id)) issues.push('unmerged_duplicate_group');
    return {
      id,
      eventName: item.eventName,
      ready: issues.length === 0,
      issues: [...new Set(issues)],
      updatedAt: item.updatedAt.toISOString(),
    };
  });
}

export async function runBulkAccept(input: {
  candidateIds: string[];
  dryRun: boolean;
  expected?: Array<{ id: string; updatedAt: string }>;
  adminUserId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const preview = await previewBulkAccept(input.candidateIds, now);
  if (input.dryRun) return { dryRun: true, items: preview, accepted: [], failed: [] };
  const expected = new Map((input.expected || []).map((item) => [item.id, item.updatedAt]));
  const checklistTemplates = await loadChecklistTemplates();
  const accepted: Array<{ candidateId: string; eventId: string; eventName: string }> = [];
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
      const result = await acceptOneCandidate(
        item.id,
        expectedUpdatedAt,
        input.adminUserId,
        checklistTemplates,
        now,
      );
      accepted.push(result);
    } catch (error) {
      failed.push({
        id: item.id,
        eventName: item.eventName,
        issues: [error instanceof Error ? error.message : 'accept_failed'],
      });
    }
  }
  return { dryRun: false, items: preview, accepted, failed };
}

async function acceptOneCandidate(
  candidateId: string,
  expectedUpdatedAt: string,
  adminUserId: string,
  checklistTemplates: ChecklistTemplates,
  now: Date,
) {
  return prisma.$transaction(async (tx) => {
    const candidate = await tx.eventCandidate.findUnique({
      where: { id: candidateId },
      include: { source: true },
    });
    if (!candidate || candidate.updatedAt.toISOString() !== expectedUpdatedAt) {
      throw new Error('preview_snapshot_changed');
    }
    if (!['new', 'needs_review'].includes(candidate.status))
      throw new Error('candidate_not_pending');
    const issues = candidateAcceptIssues(candidate as CandidateWorkflowItem, now);
    if (issues.length) throw new Error(issues.join(','));
    const data = aiEventCandidateSchema.parse(candidate.extractedData);
    const checklist = selectChecklistTemplate(data.distanceItems, checklistTemplates);
    const eventDate = data.eventDate!;
    const event = await tx.event.create({
      data: {
        eventName: data.eventName,
        city: data.city,
        eventDate: new Date(`${eventDate}T00:00:00.000Z`),
        distanceItems: data.distanceItems,
        signupStatus: data.signupStatus as SignupStatus,
        signupDeadline: data.signupDeadline ? new Date(data.signupDeadline) : null,
        officialUrl: data.officialUrl!,
        sourceName: data.sourceName,
        sourceUrl: data.sourceUrl!,
        sourceLevel: data.sourceLevel as SourceLevel,
        publishStatus: 'draft',
        infoStatus: 'ai_generated',
        runJudgement: data.runJudgement as RunJudgement,
        judgementSummary: data.judgementSummary || null,
        judgementReasons: data.judgementReasons,
        suitableFor: data.suitableFor,
        notSuitableFor: data.notSuitableFor,
        tags: data.tags,
        fieldConfidence: { ...data.confidence, aiCandidateId: candidate.id },
        checklistItems: { create: checklist },
        eventTags: {
          create: data.tags.map((tagName) => ({ tagName, tagType: 'experience' })),
        },
      },
    });
    const acceptedCandidate = await tx.eventCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'accepted',
        acceptedEventId: event.id,
        reviewedBy: adminUserId,
        reviewedAt: now,
      },
    });
    await tx.adminOperationLog.create({
      data: {
        adminUserId,
        action: 'event_candidate.bulk_accept',
        targetType: 'event_candidates',
        targetId: candidate.id,
        beforeValue: candidate as unknown as Prisma.InputJsonValue,
        afterValue: { eventId: event.id, candidateId: acceptedCandidate.id },
        note: '批量预览确认后采纳为赛事草稿',
      },
    });
    return { candidateId: candidate.id, eventId: event.id, eventName: event.eventName };
  });
}

export function selectChecklistTemplate(distanceItems: string[], templates: ChecklistTemplates) {
  const hasFull = distanceItems.some(
    (item) => /全|42|full/i.test(item) || (/马拉松|marathon/i.test(item) && !/半|half/i.test(item)),
  );
  const normalized = distanceItems.join(' ');
  const key = hasFull
    ? 'full'
    : /半|half|21/i.test(normalized)
      ? 'half'
      : /10/.test(normalized)
        ? '10K'
        : /5/.test(normalized)
          ? '5K'
          : 'general';
  return templates[key]?.length ? templates[key] : templates.general || fallbackChecklist;
}

async function loadChecklistTemplates(): Promise<ChecklistTemplates> {
  const config = await prisma.systemConfig.findUnique({
    where: { configKey: 'checklist_templates' },
  });
  const value = config?.configValue;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { general: fallbackChecklist };
  }
  return Object.entries(value as Record<string, unknown>).reduce<ChecklistTemplates>(
    (result, [key, rows]) => {
      if (!Array.isArray(rows)) return result;
      const parsed = rows.flatMap((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const row = item as Record<string, unknown>;
        const groupName = String(row.groupName || '').trim();
        const itemName = String(row.itemName || '').trim();
        if (!groupName || !itemName) return [];
        return [
          {
            groupName,
            itemName,
            itemStatus: 'pending_verify' as InfoStatus,
            sortOrder: Number.isInteger(row.sortOrder) ? Number(row.sortOrder) : index + 1,
          },
        ];
      });
      if (parsed.length) result[key] = parsed;
      return result;
    },
    { general: fallbackChecklist },
  );
}

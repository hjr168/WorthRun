import { Prisma, prisma } from '@worth-running/database';
import {
  isFutureChinaDate,
  isGreaterBayAreaCity,
  normalizeGreaterBayAreaCity,
} from '@worth-running/shared';
import { aiEventCandidateSchema, type AiEventCandidate } from './ai/eventCandidateSchema.js';
import { classifyCandidate } from './ai/eventSourceOperations.js';
import { hasOfficialEvidence } from './sourceAuthority.js';

const pendingStatuses = ['new', 'needs_review'] as const;

export interface CandidateWorkflowItem {
  id: string;
  status: string;
  eventName: string;
  city: string;
  eventDate: Date | null;
  officialUrl: string | null;
  sourceUrl: string | null;
  extractedData: unknown;
  evidence: unknown;
  reviewIssues: string[];
  updatedAt: Date;
  mergedIntoCandidateId?: string | null;
  source: {
    id: string;
    name: string;
    sourceType: string;
    sourceLevel: string;
  } | null;
}

export interface CandidateDuplicateGroup {
  groupKey: string;
  suggestedPrimaryId: string;
  items: CandidateWorkflowItem[];
}

export function candidateAcceptIssues(item: CandidateWorkflowItem, now = new Date()) {
  const parsed = aiEventCandidateSchema.safeParse(item.extractedData);
  if (!parsed.success) return ['invalid_candidate_data'];
  const data = parsed.data;
  const issues: string[] = [];
  if (!pendingStatuses.includes(item.status as (typeof pendingStatuses)[number])) {
    issues.push('candidate_not_pending');
  }
  if (!data.eventDate) issues.push('missing_event_date');
  else if (!isFutureChinaDate(data.eventDate, now)) issues.push('expired_event_date');
  if (!isGreaterBayAreaCity(data.city)) issues.push('outside_greater_bay_area');
  if (!data.distanceItems.length) issues.push('missing_distance_items');
  if (!data.officialUrl) issues.push('missing_official_url');
  if (!data.sourceUrl) issues.push('missing_source_url');
  if (
    item.source?.sourceLevel === 'community' &&
    !hasOfficialEvidence('community', data.officialUrl, data.sourceUrl)
  ) {
    issues.push('community_without_official_evidence');
  }
  if (item.reviewIssues.includes('duplicate_event')) issues.push('duplicate_event');
  if (item.reviewIssues.includes('source_date_conflict')) issues.push('source_date_conflict');
  return [...new Set(issues)];
}

export function buildCandidateDuplicateGroups(items: CandidateWorkflowItem[]) {
  const pending = items.filter(
    (item) =>
      pendingStatuses.includes(item.status as (typeof pendingStatuses)[number]) && item.eventDate,
  );
  const buckets = new Map<string, CandidateWorkflowItem[]>();
  for (const item of pending) {
    const city = normalizeGreaterBayAreaCity(item.city);
    if (!city || !item.eventDate) continue;
    const key = `${city}|${item.eventDate.toISOString().slice(0, 10)}`;
    buckets.set(key, [...(buckets.get(key) || []), item]);
  }

  const groups: CandidateDuplicateGroup[] = [];
  for (const [key, bucket] of buckets) {
    const remaining = new Set(bucket.map((item) => item.id));
    while (remaining.size) {
      const firstId = remaining.values().next().value as string;
      const componentIds = new Set([firstId]);
      remaining.delete(firstId);
      let changed = true;
      while (changed) {
        changed = false;
        for (const candidateId of [...remaining]) {
          const candidate = bucket.find((item) => item.id === candidateId)!;
          if (
            [...componentIds].some((id) =>
              haveOverlappingDistances(
                candidate,
                bucket.find((item) => item.id === id)!,
              ),
            )
          ) {
            componentIds.add(candidateId);
            remaining.delete(candidateId);
            changed = true;
          }
        }
      }
      if (componentIds.size < 2) continue;
      const component = bucket.filter((item) => componentIds.has(item.id));
      const suggested = [...component].sort(
        (a, b) => candidateAuthorityScore(b) - candidateAuthorityScore(a),
      )[0];
      groups.push({
        groupKey: `${key}|${groups.length + 1}`,
        suggestedPrimaryId: suggested.id,
        items: component,
      });
    }
  }
  return groups;
}

export function mergeCandidateData(items: CandidateWorkflowItem[], primaryId: string) {
  const primary = items.find((item) => item.id === primaryId);
  if (!primary) throw new Error('主候选不在合并列表中');
  const parsedItems = items.map((item) => ({
    item,
    data: aiEventCandidateSchema.parse(item.extractedData),
  }));
  const primaryData = parsedItems.find((entry) => entry.item.id === primaryId)!.data;
  const strongest = [...parsedItems].sort(
    (a, b) => candidateAuthorityScore(b.item) - candidateAuthorityScore(a.item),
  )[0];
  const strongestWithOfficialUrl = [...parsedItems]
    .filter((entry) => entry.data.officialUrl)
    .sort((a, b) => candidateAuthorityScore(b.item) - candidateAuthorityScore(a.item))[0];

  return aiEventCandidateSchema.parse({
    ...primaryData,
    distanceItems: union(parsedItems.flatMap((entry) => entry.data.distanceItems)),
    judgementReasons: union(parsedItems.flatMap((entry) => entry.data.judgementReasons)),
    suitableFor: union(parsedItems.flatMap((entry) => entry.data.suitableFor)),
    notSuitableFor: union(parsedItems.flatMap((entry) => entry.data.notSuitableFor)),
    tags: union(parsedItems.flatMap((entry) => entry.data.tags)),
    evidence: uniqueEvidence(parsedItems.flatMap((entry) => entry.data.evidence)),
    officialUrl: strongestWithOfficialUrl?.data.officialUrl || primaryData.officialUrl,
    sourceName: strongest.data.sourceName,
    sourceUrl: strongest.data.sourceUrl,
    sourceLevel: strongest.data.sourceLevel,
    confidence: { ...primaryData.confidence, ...strongest.data.confidence },
  });
}

export async function getCandidateDuplicateGroups() {
  const items = await prisma.eventCandidate.findMany({
    where: { status: { in: [...pendingStatuses] }, eventDate: { not: null } },
    include: { source: true },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  return buildCandidateDuplicateGroups(items);
}

export async function mergeEventCandidates(input: {
  primaryId: string;
  mergedIds: string[];
  adminUserId: string;
  now?: Date;
}) {
  const ids = [...new Set([input.primaryId, ...input.mergedIds])];
  if (ids.length < 2 || ids.length > 20) throw new Error('请选择 2 至 20 条候选进行合并');
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const items = await tx.eventCandidate.findMany({
      where: { id: { in: ids } },
      include: { source: true },
      orderBy: { createdAt: 'asc' },
    });
    if (items.length !== ids.length) throw new Error('候选赛事不存在');
    const primary = items.find((item) => item.id === input.primaryId)!;
    const secondaries = items.filter((item) => item.id !== input.primaryId);
    if (
      secondaries.every(
        (item) => item.status === 'merged' && item.mergedIntoCandidateId === input.primaryId,
      )
    ) {
      return { primary, mergedIds: secondaries.map((item) => item.id), idempotent: true };
    }
    if (!pendingStatuses.includes(primary.status as (typeof pendingStatuses)[number])) {
      throw new Error('主候选必须处于待审核状态');
    }
    if (
      secondaries.some(
        (item) => !pendingStatuses.includes(item.status as (typeof pendingStatuses)[number]),
      )
    ) {
      throw new Error('只能合并待审核候选');
    }
    if (secondaries.some((item) => !sameCityAndDate(primary, item))) {
      throw new Error('只能合并同城市且同比赛日期的候选');
    }
    if (secondaries.some((item) => !haveOverlappingDistances(primary, item))) {
      throw new Error('候选距离项目不重叠，不能合并');
    }

    const mergedData = mergeCandidateData(items, primary.id);
    const classification = classifyCandidate(mergedData, now, primary.duplicateEventId);
    const primaryUpdated = await tx.eventCandidate.update({
      where: { id: primary.id },
      data: {
        eventName: mergedData.eventName,
        city: mergedData.city,
        eventDate: mergedData.eventDate ? new Date(`${mergedData.eventDate}T00:00:00.000Z`) : null,
        sourceUrl: mergedData.sourceUrl,
        officialUrl: mergedData.officialUrl,
        extractedData: mergedData as Prisma.InputJsonObject,
        evidence: mergedData.evidence as Prisma.InputJsonArray,
        confidence: mergedData.confidence as Prisma.InputJsonObject,
        priorityScore: classification.priorityScore,
        reviewIssues: classification.reviewIssues,
        status: 'needs_review',
      },
    });
    await tx.eventCandidate.updateMany({
      where: { id: { in: secondaries.map((item) => item.id) } },
      data: {
        status: 'merged',
        mergedIntoCandidateId: primary.id,
        reviewedBy: input.adminUserId,
        reviewedAt: now,
      },
    });
    await tx.adminOperationLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: 'event_candidate.merge',
        targetType: 'event_candidates',
        targetId: primary.id,
        beforeValue: { primary, secondaries } as unknown as Prisma.InputJsonValue,
        afterValue: {
          primaryId: primary.id,
          mergedIds: secondaries.map((item) => item.id),
        },
        note: `合并 ${secondaries.length} 条疑似重复候选`,
      },
    });
    return {
      primary: primaryUpdated,
      mergedIds: secondaries.map((item) => item.id),
      idempotent: false,
    };
  });
}

function sameCityAndDate(a: CandidateWorkflowItem, b: CandidateWorkflowItem) {
  return (
    normalizeGreaterBayAreaCity(a.city) === normalizeGreaterBayAreaCity(b.city) &&
    a.eventDate?.toISOString().slice(0, 10) === b.eventDate?.toISOString().slice(0, 10)
  );
}

function haveOverlappingDistances(a: CandidateWorkflowItem, b: CandidateWorkflowItem) {
  const left = distanceItems(a);
  const right = new Set(distanceItems(b));
  return left.length > 0 && left.some((item) => right.has(item));
}

function distanceItems(item: CandidateWorkflowItem) {
  const parsed = aiEventCandidateSchema.safeParse(item.extractedData);
  return parsed.success ? parsed.data.distanceItems.map(normalizeDistance) : [];
}

function normalizeDistance(value: string) {
  if (/半|half/i.test(value)) return 'half';
  if (/全|42|marathon/i.test(value)) return 'marathon';
  if (/10/.test(value)) return '10k';
  if (/5/.test(value)) return '5k';
  return value.trim().toLowerCase();
}

function candidateAuthorityScore(item: CandidateWorkflowItem) {
  const sourceLevelScores: Record<string, number> = {
    official: 50,
    trusted: 30,
    secondary: 15,
    community: 5,
    unknown: 0,
  };
  const evidenceCount = Array.isArray(item.evidence) ? item.evidence.length : 0;
  return (
    (item.officialUrl ? 100 : 0) +
    (sourceLevelScores[item.source?.sourceLevel || 'unknown'] || 0) +
    (item.source?.sourceType === 'page_url' ? 20 : 0) +
    Math.min(evidenceCount, 10)
  );
}

function union(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function uniqueEvidence(values: AiEventCandidate['evidence']) {
  const seen = new Set<string>();
  return values.filter((item) => {
    const key = `${item.field}|${item.sourceUrl}|${item.quote}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

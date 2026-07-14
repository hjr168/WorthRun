import { EventCandidateStatus, Prisma, prisma } from '@worth-running/database';
import { classifyCandidate } from './eventSourceOperations.js';
import type { SourceCandidate } from './sources/sourceCandidate.js';

type ExistingCandidate = { status: string } | null;

export function decideCandidateWrite(existing: ExistingCandidate) {
  if (!existing) return 'create' as const;
  if (existing.status === 'new' || existing.status === 'needs_review') return 'update' as const;
  return 'skip_reviewed' as const;
}

export interface PersistSummary {
  fetched: number;
  created: number;
  updated: number;
  skippedReviewed: number;
  duplicateEvents: number;
  candidateIds: string[];
}

export async function persistEventCandidates(
  sourceId: string,
  items: SourceCandidate[],
  now: Date = new Date(),
): Promise<PersistSummary> {
  const summary: PersistSummary = {
    fetched: items.length,
    created: 0,
    updated: 0,
    skippedReviewed: 0,
    duplicateEvents: 0,
    candidateIds: [],
  };

  for (const item of items) {
    const candidate = item.candidate;
    const eventDate = candidate.eventDate
      ? new Date(`${candidate.eventDate}T00:00:00.000Z`)
      : null;
    const duplicate = eventDate
      ? await prisma.event.findFirst({
          where: { eventName: candidate.eventName, city: candidate.city, eventDate },
          select: { id: true },
        })
      : null;

    const existing = item.sourceExternalId
      ? await prisma.eventCandidate.findUnique({
          where: {
            sourceId_sourceExternalId: {
              sourceId,
              sourceExternalId: item.sourceExternalId,
            },
          },
        })
      : await prisma.eventCandidate.findFirst({
          where: {
            sourceId,
            eventName: candidate.eventName,
            city: candidate.city,
            eventDate,
          },
          orderBy: { createdAt: 'desc' },
        });

    const decision = decideCandidateWrite(existing);
    if (decision === 'skip_reviewed') {
      summary.skippedReviewed += 1;
      continue;
    }

    if (duplicate) summary.duplicateEvents += 1;
    const classification = classifyCandidate(candidate, now, duplicate?.id);
    const data = {
      sourceId,
      sourceExternalId: item.sourceExternalId,
      status: existing
        ? EventCandidateStatus.needs_review
        : duplicate
          ? EventCandidateStatus.needs_review
          : EventCandidateStatus.new,
      eventName: candidate.eventName,
      city: candidate.city,
      eventDate,
      sourceUrl: candidate.sourceUrl,
      officialUrl: candidate.officialUrl,
      extractedData: candidate as Prisma.InputJsonObject,
      evidence: candidate.evidence as Prisma.InputJsonArray,
      confidence: candidate.confidence as Prisma.InputJsonObject,
      rawPayload: item.rawPayload
        ? (item.rawPayload as Prisma.InputJsonObject)
        : Prisma.JsonNull,
      extractorVersion: item.extractorVersion,
      duplicateEventId: duplicate?.id ?? null,
      priorityScore: classification.priorityScore,
      reviewIssues: classification.reviewIssues,
      aiModel: item.aiModel,
      aiPromptVersion: item.aiPromptVersion,
    };

    const saved = existing
      ? await prisma.eventCandidate.update({ where: { id: existing.id }, data })
      : await prisma.eventCandidate.create({ data });

    if (existing) summary.updated += 1;
    else summary.created += 1;
    summary.candidateIds.push(saved.id);
  }

  return summary;
}

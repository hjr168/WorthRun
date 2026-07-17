import { EventCandidateStatus, Prisma, prisma } from '@worth-running/database';
import { isFutureChinaDate, isGreaterBayAreaCity } from '@worth-running/shared';
import { canMonitorPublishedEventChanges, classifyCandidate } from './eventSourceOperations.js';
import type { SourceCandidate } from './sources/sourceCandidate.js';
import { detectEventChanges } from '../eventChangeDetection.js';

type ExistingCandidate = { status: string } | null;

export function decideCandidateWrite(existing: ExistingCandidate) {
  if (!existing) return 'create' as const;
  if (existing.status === 'new' || existing.status === 'needs_review') return 'update' as const;
  return 'skip_reviewed' as const;
}

export function shouldPersistCandidateByDate(
  eventDate: string | null | undefined,
  now: Date = new Date(),
) {
  return isFutureChinaDate(eventDate, now);
}

export function candidateExclusionReason(
  candidate: { eventDate?: string | null; city?: string | null },
  now: Date = new Date(),
) {
  if (!shouldPersistCandidateByDate(candidate.eventDate, now)) return 'expired' as const;
  if (!isGreaterBayAreaCity(candidate.city)) return 'outside_region' as const;
  return null;
}

export interface PersistSummary {
  fetched: number;
  created: number;
  updated: number;
  skippedReviewed: number;
  skippedExpired: number;
  skippedOutsideRegion: number;
  duplicateEvents: number;
  changeAlertsCreated: number;
  changeAlertsExisting: number;
  candidateIds: string[];
}

interface PersistOptions {
  sourceRunId?: string | null;
  store?: typeof prisma;
}

export function resolveCandidateOfficialUrl(
  sourceLevel: string,
  officialUrl: string | null | undefined,
  sourceUrl: string | null | undefined,
) {
  if (officialUrl) return officialUrl;
  if (sourceLevel !== 'official' || !sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    if (
      /(^|\.)worldathletics\.org$/i.test(url.hostname) &&
      url.pathname.replace(/\/+$/, '') === '/competition/calendar-results'
    ) {
      return null;
    }
  } catch {
    return sourceUrl;
  }
  return sourceUrl;
}

export async function persistEventCandidates(
  sourceId: string,
  items: SourceCandidate[],
  now: Date = new Date(),
  options: PersistOptions = {},
): Promise<PersistSummary> {
  const store = options.store ?? prisma;
  const source = await store.eventSource.findUnique({
    where: { id: sourceId },
    select: { sourceLevel: true },
  });
  if (!source) throw new Error('赛事源不存在');
  const summary: PersistSummary = {
    fetched: items.length,
    created: 0,
    updated: 0,
    skippedReviewed: 0,
    skippedExpired: 0,
    skippedOutsideRegion: 0,
    duplicateEvents: 0,
    changeAlertsCreated: 0,
    changeAlertsExisting: 0,
    candidateIds: [],
  };

  for (const item of items) {
    const candidate = {
      ...item.candidate,
      sourceLevel: source.sourceLevel,
      officialUrl: resolveCandidateOfficialUrl(
        source.sourceLevel,
        item.candidate.officialUrl,
        item.candidate.sourceUrl,
      ),
    };
    const eventDate = candidate.eventDate ? new Date(`${candidate.eventDate}T00:00:00.000Z`) : null;

    let existing = item.sourceExternalId
      ? await store.eventCandidate.findUnique({
          where: {
            sourceId_sourceExternalId: {
              sourceId,
              sourceExternalId: item.sourceExternalId,
            },
          },
          select: reviewedCandidateSelect,
        })
      : await store.eventCandidate.findFirst({
          where: {
            sourceId,
            eventName: candidate.eventName,
            city: candidate.city,
            eventDate,
          },
          orderBy: { createdAt: 'desc' },
          select: reviewedCandidateSelect,
        });

    if (!existing && !item.sourceExternalId) {
      existing = await store.eventCandidate.findFirst({
        where: {
          sourceId,
          eventName: candidate.eventName,
          city: candidate.city,
          status: { in: reviewedCandidateStatuses },
        },
        orderBy: { reviewedAt: 'desc' },
        select: reviewedCandidateSelect,
      });
    }

    const decision = decideCandidateWrite(existing);
    if (decision === 'skip_reviewed') {
      summary.skippedReviewed += 1;
      const reviewedCandidate = existing;
      if (reviewedCandidate && canMonitorPublishedEventChanges(source.sourceLevel)) {
        const eventId =
          reviewedCandidate.acceptedEventId ?? reviewedCandidate.mergedInto?.acceptedEventId;
        if (eventId) {
          const event = await store.event.findUnique({
            where: { id: eventId },
            select: {
              id: true,
              publishStatus: true,
              eventDate: true,
              distanceItems: true,
              signupStatus: true,
              signupDeadline: true,
              officialUrl: true,
            },
          });
          if (event?.publishStatus === 'published') {
            await store.$executeRaw(
              Prisma.sql`UPDATE "events" SET "source_checked_at" = ${now} WHERE "id" = ${event.id}`,
            );
            const sourceText = candidate.evidence.map((entry) => entry.quote).join('\n');
            const diff = detectEventChanges(sourceId, event, candidate, sourceText);
            if (diff) {
              const uniqueWhere = {
                eventId_sourceId_fingerprint: {
                  eventId: event.id,
                  sourceId,
                  fingerprint: diff.fingerprint,
                },
              };
              const existingAlert = await store.eventChangeAlert.findUnique({
                where: uniqueWhere,
                select: { id: true, status: true },
              });
              const evidence = candidate.evidence.slice(0, 10) as Prisma.InputJsonArray;
              if (!existingAlert) {
                await store.eventChangeAlert.upsert({
                  where: uniqueWhere,
                  create: {
                    eventId: event.id,
                    sourceId,
                    sourceRunId: options.sourceRunId ?? null,
                    sourceCandidateId: reviewedCandidate.id,
                    severity: diff.severity,
                    changedFields: diff.changedFields,
                    beforeValue: diff.beforeValue as Prisma.InputJsonObject,
                    afterValue: diff.afterValue as Prisma.InputJsonObject,
                    evidence,
                    sourceUrl: candidate.sourceUrl,
                    fingerprint: diff.fingerprint,
                  },
                  update: {},
                });
                summary.changeAlertsCreated += 1;
              } else {
                if (existingAlert.status === 'open') {
                  await store.eventChangeAlert.upsert({
                    where: uniqueWhere,
                    create: {
                      eventId: event.id,
                      sourceId,
                      sourceRunId: options.sourceRunId ?? null,
                      sourceCandidateId: reviewedCandidate.id,
                      severity: diff.severity,
                      changedFields: diff.changedFields,
                      beforeValue: diff.beforeValue as Prisma.InputJsonObject,
                      afterValue: diff.afterValue as Prisma.InputJsonObject,
                      evidence,
                      sourceUrl: candidate.sourceUrl,
                      fingerprint: diff.fingerprint,
                    },
                    update: {
                      sourceRunId: options.sourceRunId ?? null,
                      sourceCandidateId: reviewedCandidate.id,
                      evidence,
                      sourceUrl: candidate.sourceUrl,
                    },
                  });
                }
                summary.changeAlertsExisting += 1;
              }
            }
          }
        }
      }
      continue;
    }

    const exclusionReason = candidateExclusionReason(candidate, now);
    if (exclusionReason === 'expired') {
      summary.skippedExpired += 1;
      continue;
    }
    if (exclusionReason === 'outside_region') {
      summary.skippedOutsideRegion += 1;
      continue;
    }

    const duplicate = eventDate
      ? await store.event.findFirst({
          where: { eventName: candidate.eventName, city: candidate.city, eventDate },
          select: { id: true },
        })
      : null;

    if (duplicate) summary.duplicateEvents += 1;
    const classification = classifyCandidate(candidate, now, duplicate?.id);
    const reviewIssues = [
      ...new Set([...classification.reviewIssues, ...(item.reviewIssues ?? [])]),
    ];
    const requiresReview = Boolean(duplicate || reviewIssues.includes('source_date_conflict'));
    const data = {
      sourceId,
      sourceExternalId: item.sourceExternalId,
      status: existing
        ? EventCandidateStatus.needs_review
        : requiresReview
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
      rawPayload: item.rawPayload ? (item.rawPayload as Prisma.InputJsonObject) : Prisma.JsonNull,
      extractorVersion: item.extractorVersion,
      duplicateEventId: duplicate?.id ?? null,
      priorityScore: classification.priorityScore,
      reviewIssues,
      aiModel: item.aiModel,
      aiPromptVersion: item.aiPromptVersion,
    };

    const saved = existing
      ? await store.eventCandidate.update({ where: { id: existing.id }, data })
      : await store.eventCandidate.create({ data });

    if (existing) summary.updated += 1;
    else summary.created += 1;
    summary.candidateIds.push(saved.id);
  }

  return summary;
}

const reviewedCandidateStatuses = [
  EventCandidateStatus.accepted,
  EventCandidateStatus.rejected,
  EventCandidateStatus.merged,
];

const reviewedCandidateSelect = {
  id: true,
  status: true,
  acceptedEventId: true,
  mergedInto: { select: { acceptedEventId: true } },
} satisfies Prisma.EventCandidateSelect;

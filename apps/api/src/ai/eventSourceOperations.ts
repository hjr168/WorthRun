const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_FAILURE_BACKOFF_MS = 6 * 60 * 60 * 1000;

export const candidateReviewIssues = [
  'missing_event_date',
  'missing_official_url',
  'missing_source_url',
  'duplicate_event',
  'source_date_conflict',
] as const;

export type CandidateReviewIssue = (typeof candidateReviewIssues)[number];

export function canMonitorPublishedEventChanges(sourceLevel: string) {
  return sourceLevel === 'official' || sourceLevel === 'trusted';
}

interface CandidateForClassification {
  eventDate?: string | null;
  officialUrl?: string | null;
  sourceUrl?: string | null;
}

export function classifyCandidate(
  candidate: CandidateForClassification,
  now: Date,
  duplicateEventId?: string | null,
) {
  const reviewIssues: CandidateReviewIssue[] = [];
  if (!candidate.eventDate) reviewIssues.push('missing_event_date');
  if (!candidate.officialUrl) reviewIssues.push('missing_official_url');
  if (!candidate.sourceUrl) reviewIssues.push('missing_source_url');
  if (duplicateEventId) reviewIssues.push('duplicate_event');

  return {
    priorityScore: candidatePriorityScore(candidate.eventDate, now),
    reviewIssues,
  };
}

export function nextPageAfterRun(input: { endPage: number; remotePageCount: number | null }) {
  if (input.remotePageCount !== null && input.endPage >= input.remotePageCount) return 1;
  return Math.max(1, input.endPage + 1);
}

export function failureBackoffMs(consecutiveFailures: number) {
  const safeFailures = Math.max(1, Math.floor(consecutiveFailures));
  return Math.min(15 * 60 * 1000 * 2 ** (safeFailures - 1), MAX_FAILURE_BACKOFF_MS);
}

function candidatePriorityScore(eventDate: string | null | undefined, now: Date) {
  if (!eventDate) return 20;
  const eventTime = Date.parse(`${eventDate}T00:00:00.000Z`);
  if (Number.isNaN(eventTime)) return 20;

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysUntilEvent = Math.floor((eventTime - today) / DAY_MS);
  if (daysUntilEvent < 0) return 0;
  if (daysUntilEvent <= 30) return 100;
  if (daysUntilEvent <= 90) return 80;
  return 50;
}

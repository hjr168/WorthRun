import { Prisma } from '@worth-running/database';
import { z } from 'zod';
import { candidateReviewIssues } from './eventSourceOperations.js';

const optionalQueryString = z.preprocess((value) => {
  if (Array.isArray(value)) return value[0];
  if (value === undefined || value === '') return undefined;
  return String(value).trim();
}, z.string().min(1).optional());

const boundedPagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const eventSourceRunQuerySchema = boundedPagination.extend({
  sourceId: optionalQueryString,
  status: z.enum(['running', 'succeeded', 'failed']).optional(),
});

export const eventCandidateQuerySchema = boundedPagination.extend({
  sourceId: optionalQueryString,
  status: z.enum(['new', 'needs_review', 'accepted', 'rejected', 'merged']).optional(),
  issue: z.enum(candidateReviewIssues).optional(),
  sort: z.enum(['priority', 'newest']).default('priority'),
});

export type EventSourceRunQuery = z.infer<typeof eventSourceRunQuerySchema>;
export type EventCandidateQuery = z.infer<typeof eventCandidateQuerySchema>;

export function buildCandidateWhere(query: EventCandidateQuery): Prisma.EventCandidateWhereInput {
  const where: Prisma.EventCandidateWhereInput = {};
  if (query.sourceId) where.sourceId = query.sourceId;
  if (query.status) where.status = query.status;
  if (query.issue) where.reviewIssues = { has: query.issue };
  return where;
}

export function buildCandidateOrderBy(
  sort: EventCandidateQuery['sort'],
): Prisma.EventCandidateOrderByWithRelationInput[] {
  if (sort === 'newest') return [{ createdAt: 'desc' }];
  return [{ priorityScore: 'desc' }, { eventDate: 'asc' }, { createdAt: 'desc' }];
}

export function nextRunAtForSourceConfig(
  input: { status: 'active' | 'paused'; scheduleEnabled: boolean },
  currentNextRunAt: Date | null,
  now: Date,
) {
  if (input.status !== 'active' || !input.scheduleEnabled) return null;
  return currentNextRunAt ?? now;
}

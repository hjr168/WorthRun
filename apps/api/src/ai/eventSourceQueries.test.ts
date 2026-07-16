import { describe, expect, it } from 'vitest';
import {
  buildCandidateOrderBy,
  buildCandidateWhere,
  eventCandidateQuerySchema,
  eventSourceRunQuerySchema,
  nextRunAtForSourceConfig,
} from './eventSourceQueries.js';

describe('event source admin queries', () => {
  it('parses bounded run history pagination', () => {
    expect(
      eventSourceRunQuerySchema.parse({
        sourceId: 'source-1',
        status: 'failed',
        page: '2',
        pageSize: '50',
      }),
    ).toEqual({ sourceId: 'source-1', status: 'failed', page: 2, pageSize: 50 });
    expect(() => eventSourceRunQuerySchema.parse({ pageSize: 51 })).toThrow();
  });

  it('accepts only known candidate issues and builds the default priority query', () => {
    const query = eventCandidateQuerySchema.parse({
      sourceId: 'source-1',
      status: 'needs_review',
      issue: 'missing_official_url',
      readiness: 'blocked',
    });

    expect(buildCandidateWhere(query)).toEqual({
      sourceId: 'source-1',
      status: 'needs_review',
      reviewIssues: { has: 'missing_official_url' },
    });
    expect(buildCandidateOrderBy(query.sort)).toEqual([
      { priorityScore: 'desc' },
      { eventDate: 'asc' },
      { createdAt: 'desc' },
    ]);
    expect(() => eventCandidateQuerySchema.parse({ issue: 'unknown_issue' })).toThrow();
    expect(() => eventCandidateQuerySchema.parse({ readiness: 'unknown' })).toThrow();
  });

  it('uses newest ordering only when explicitly requested', () => {
    expect(buildCandidateOrderBy('newest')).toEqual([{ createdAt: 'desc' }]);
  });

  it('sets, preserves, or clears nextRunAt from safe source config', () => {
    const now = new Date('2026-07-14T05:00:00.000Z');
    const existing = new Date('2026-07-15T05:00:00.000Z');

    expect(nextRunAtForSourceConfig({ status: 'active', scheduleEnabled: true }, null, now)).toBe(
      now,
    );
    expect(
      nextRunAtForSourceConfig({ status: 'active', scheduleEnabled: true }, existing, now),
    ).toBe(existing);
    expect(
      nextRunAtForSourceConfig({ status: 'paused', scheduleEnabled: true }, existing, now),
    ).toBeNull();
    expect(
      nextRunAtForSourceConfig({ status: 'active', scheduleEnabled: false }, existing, now),
    ).toBeNull();
  });
});

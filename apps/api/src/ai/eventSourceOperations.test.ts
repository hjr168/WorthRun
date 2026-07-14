import { describe, expect, it } from 'vitest';
import {
  classifyCandidate,
  failureBackoffMs,
  nextPageAfterRun,
} from './eventSourceOperations.js';

const now = new Date('2026-07-14T08:00:00.000Z');

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    eventDate: '2026-08-01',
    officialUrl: 'https://official.example/race',
    sourceUrl: 'https://source.example/race',
    ...overrides,
  };
}

describe('classifyCandidate', () => {
  it('prioritizes races within 30 days and reports missing official URLs', () => {
    expect(classifyCandidate(candidate({ officialUrl: null }), now)).toEqual({
      priorityScore: 100,
      reviewIssues: ['missing_official_url'],
    });
  });

  it('uses deterministic date bands', () => {
    expect(classifyCandidate(candidate({ eventDate: '2026-07-13' }), now).priorityScore).toBe(0);
    expect(classifyCandidate(candidate({ eventDate: null }), now).priorityScore).toBe(20);
    expect(classifyCandidate(candidate({ eventDate: '2026-10-01' }), now).priorityScore).toBe(80);
    expect(classifyCandidate(candidate({ eventDate: '2027-01-01' }), now).priorityScore).toBe(50);
  });

  it('returns stable issue codes including duplicate events', () => {
    expect(
      classifyCandidate(
        candidate({ eventDate: null, officialUrl: null, sourceUrl: null }),
        now,
        'event-1',
      ).reviewIssues,
    ).toEqual([
      'missing_event_date',
      'missing_official_url',
      'missing_source_url',
      'duplicate_event',
    ]);
  });
});

describe('event source pagination and retry timing', () => {
  it('advances or wraps a remote page cursor', () => {
    expect(nextPageAfterRun({ endPage: 4, remotePageCount: 10 })).toBe(5);
    expect(nextPageAfterRun({ endPage: 10, remotePageCount: 10 })).toBe(1);
    expect(nextPageAfterRun({ endPage: 1, remotePageCount: null })).toBe(2);
  });

  it('backs off failures from 15 minutes up to 6 hours', () => {
    expect(failureBackoffMs(1)).toBe(15 * 60 * 1000);
    expect(failureBackoffMs(2)).toBe(30 * 60 * 1000);
    expect(failureBackoffMs(3)).toBe(60 * 60 * 1000);
    expect(failureBackoffMs(8)).toBe(6 * 60 * 60 * 1000);
  });
});

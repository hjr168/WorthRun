import { describe, expect, it } from 'vitest';
import { buildCandidateFingerprint, formatRunStatus } from './runEventSource.js';

describe('buildCandidateFingerprint', () => {
  it('uses normalized eventName city date', () => {
    expect(buildCandidateFingerprint(' 广州黄埔马拉松 ', '广州', '2026-12-20')).toBe(
      '广州黄埔马拉松|广州|2026-12-20',
    );
  });
});

describe('formatRunStatus', () => {
  it('formats compact batch counters for the source row', () => {
    expect(
      formatRunStatus({
        sourceId: 'source-1',
        totalAvailable: 2830,
        fetched: 20,
        created: 12,
        updated: 3,
        skippedReviewed: 5,
        duplicateEvents: 2,
        candidateIds: [],
      }),
    ).toBe('success:fetched=20,created=12,updated=3,skipped=5,duplicates=2');
  });
});

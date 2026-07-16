import { describe, expect, it } from 'vitest';
import {
  candidateExclusionReason,
  decideCandidateWrite,
  shouldPersistCandidateByDate,
} from './persistEventCandidates.js';

describe('decideCandidateWrite', () => {
  it('creates a new candidate when no source record exists', () => {
    expect(decideCandidateWrite(null)).toBe('create');
  });

  it('updates candidates that are still awaiting review', () => {
    expect(decideCandidateWrite({ status: 'new' })).toBe('update');
    expect(decideCandidateWrite({ status: 'needs_review' })).toBe('update');
  });

  it('does not overwrite reviewed candidates', () => {
    expect(decideCandidateWrite({ status: 'accepted' })).toBe('skip_reviewed');
    expect(decideCandidateWrite({ status: 'rejected' })).toBe('skip_reviewed');
    expect(decideCandidateWrite({ status: 'merged' })).toBe('skip_reviewed');
  });
});

describe('candidateExclusionReason', () => {
  const now = new Date('2026-07-13T16:30:00.000Z');

  it('filters expired candidates before region checks', () => {
    expect(candidateExclusionReason({ eventDate: '2026-07-14', city: '北京市' }, now)).toBe(
      'expired',
    );
  });

  it('filters future candidates outside the Greater Bay Area', () => {
    expect(candidateExclusionReason({ eventDate: '2026-07-15', city: '北京市' }, now)).toBe(
      'outside_region',
    );
  });

  it('keeps future Greater Bay Area and missing-date candidates', () => {
    expect(candidateExclusionReason({ eventDate: '2026-07-15', city: '广州市' }, now)).toBeNull();
    expect(candidateExclusionReason({ eventDate: null, city: '香港特别行政区' }, now)).toBeNull();
  });
});

describe('shouldPersistCandidateByDate', () => {
  const now = new Date('2026-07-13T16:30:00.000Z');

  it('keeps only dates strictly after today in China time', () => {
    expect(shouldPersistCandidateByDate('2026-07-13', now)).toBe(false);
    expect(shouldPersistCandidateByDate('2026-07-14', now)).toBe(false);
    expect(shouldPersistCandidateByDate('2026-07-15', now)).toBe(true);
  });

  it('keeps missing or invalid dates for manual completion', () => {
    expect(shouldPersistCandidateByDate(null, now)).toBe(true);
    expect(shouldPersistCandidateByDate(undefined, now)).toBe(true);
    expect(shouldPersistCandidateByDate('not-a-date', now)).toBe(true);
  });
});

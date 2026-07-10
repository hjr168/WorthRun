import { describe, expect, it } from 'vitest';
import { decideCandidateWrite } from './persistEventCandidates.js';

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

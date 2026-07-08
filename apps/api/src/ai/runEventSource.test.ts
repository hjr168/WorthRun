import { describe, expect, it } from 'vitest';
import { buildCandidateFingerprint } from './runEventSource.js';

describe('buildCandidateFingerprint', () => {
  it('uses normalized eventName city date', () => {
    expect(buildCandidateFingerprint(' 广州黄埔马拉松 ', '广州', '2026-12-20')).toBe(
      '广州黄埔马拉松|广州|2026-12-20',
    );
  });
});

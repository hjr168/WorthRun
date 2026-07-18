import { describe, expect, it } from 'vitest';
import {
  conversionRate,
  interactionOccurredDate,
  interactionUserHash,
} from './interactionAnalytics.js';

describe('interaction analytics', () => {
  it('uses a stable secret hash without exposing the user key', () => {
    const hash = interactionUserHash('secret', 'worth-user-123');
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain('worth-user-123');
    expect(interactionUserHash('secret', 'worth-user-123')).toBe(hash);
  });

  it('deduplicates against the China calendar day', () => {
    expect(interactionOccurredDate(new Date('2026-07-13T16:30:00.000Z'))).toEqual(
      new Date('2026-07-14T00:00:00.000Z'),
    );
  });

  it('returns bounded percentage values for the dashboard', () => {
    expect(conversionRate(1, 3)).toBe(33.3);
    expect(conversionRate(0, 0)).toBe(0);
  });
});

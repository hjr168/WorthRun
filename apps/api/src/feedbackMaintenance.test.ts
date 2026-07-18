import { describe, expect, it } from 'vitest';
import { buildFeedbackMaintenanceCutoffs, chinaDay } from './feedbackMaintenance.js';

describe('feedback maintenance', () => {
  it('uses a stable Beijing date for abuse metrics', () => {
    expect(chinaDay(new Date('2026-07-16T15:59:59.000Z')).toISOString()).toBe(
      '2026-07-16T00:00:00.000Z',
    );
    expect(chinaDay(new Date('2026-07-16T16:00:00.000Z')).toISOString()).toBe(
      '2026-07-17T00:00:00.000Z',
    );
  });

  it('builds bounded retention cutoffs', () => {
    const now = new Date('2026-07-16T10:30:00.000Z');
    const cutoffs = buildFeedbackMaintenanceCutoffs(now);
    expect(cutoffs.fingerprintExpiresAt).toEqual(now);
    expect(cutoffs.rateLimitBefore.toISOString()).toBe('2026-07-14T10:30:00.000Z');
    expect(cutoffs.metricBefore.toISOString()).toBe('2026-04-17T00:00:00.000Z');
    expect(cutoffs.apiMetricBefore.toISOString()).toBe('2026-06-16T10:30:00.000Z');
  });
});

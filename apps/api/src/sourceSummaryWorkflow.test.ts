import { describe, expect, it } from 'vitest';
import {
  assertSourceSummaryReverifyEligible,
  SourceSummaryConflictError,
  SourceSummaryValidationError,
} from './sourceSummaryWorkflow.js';

describe('source summary workflow errors', () => {
  it('uses distinct conflict and validation errors for HTTP mapping', () => {
    expect(new SourceSummaryConflictError('conflict')).toBeInstanceOf(Error);
    expect(new SourceSummaryValidationError('invalid')).toBeInstanceOf(Error);
  });

  it('allows a stale published summary after all change alerts are handled', () => {
    expect(() =>
      assertSourceSummaryReverifyEligible(
        {
          status: 'published',
          staleAt: new Date(),
          sourceUrl: 'https://example.com/race',
          openChangeAlerts: 0,
        },
        '已核对原始来源',
      ),
    ).not.toThrow();
  });

  it('blocks restoring a summary while event changes remain open', () => {
    expect(() =>
      assertSourceSummaryReverifyEligible(
        {
          status: 'published',
          staleAt: new Date(),
          sourceUrl: 'https://example.com/race',
          openChangeAlerts: 1,
        },
        '已核对原始来源',
      ),
    ).toThrow('请先处理该赛事的开放变更');
  });

  it('requires a review note', () => {
    expect(() =>
      assertSourceSummaryReverifyEligible(
        {
          status: 'published',
          staleAt: new Date(),
          sourceUrl: 'https://example.com/race',
          openChangeAlerts: 0,
        },
        '短',
      ),
    ).toThrow('复核备注需为 4-500 字');
  });
});

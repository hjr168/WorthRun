import { describe, expect, it } from 'vitest';
import { formatEventSourceRunSummary } from './aiSources.js';

describe('formatEventSourceRunSummary', () => {
  it('formats operator-friendly batch counts', () => {
    expect(
      formatEventSourceRunSummary({
        sourceId: 'source-1',
        totalAvailable: 2830,
        fetched: 20,
        created: 16,
        updated: 2,
        skippedReviewed: 2,
        duplicateEvents: 1,
        candidateIds: [],
      }),
    ).toBe('读取 20 条，新增 16 条，更新 2 条，跳过已审核 2 条，疑似重复 1 条');
  });
});

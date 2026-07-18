import { describe, expect, it, vi } from 'vitest';
import {
  compressSourceText,
  generateEventSourceSummary,
  parseSourceSummaryContent,
  sourceContentHash,
} from './sourceSummaryGeneration.js';

describe('source summary generation', () => {
  it('normalizes and bounds source text without storing page markup', () => {
    const text = `  赛事公告\n\n${'报名时间和比赛地点。'.repeat(4000)}`;
    const compressed = compressSourceText(text, 1000);
    expect(compressed.length).toBeLessThanOrEqual(1000);
    expect(compressed).toContain('赛事公告');
    expect(compressed).not.toContain('\n');
  });

  it('creates a stable SHA-256 content hash', () => {
    expect(sourceContentHash('same')).toBe(sourceContentHash('same'));
    expect(sourceContentHash('same')).toHaveLength(64);
    expect(sourceContentHash('same')).not.toBe(sourceContentHash('different'));
  });

  it('rejects short or structurally invalid model output', () => {
    expect(() =>
      parseSourceSummaryContent({
        sourceTitle: null,
        summary: '太短',
        keyPoints: ['只有一项'],
        limitations: null,
      }),
    ).toThrow();
  });

  it('accepts a bounded strict summary', () => {
    const result = parseSourceSummaryContent({
      sourceTitle: '赛事公告',
      summary:
        '赛事来源页面公布了比赛日期、举办城市和参赛项目，当前摘要仅整理页面已经明确展示的信息。报名安排、具体路线和后续调整仍需返回原始来源继续确认，以赛事主办方最终公告为准。',
      keyPoints: ['页面明确列出比赛日期', '页面列出马拉松和半程马拉松项目'],
      limitations: '来源未明确报名截止时间。',
    });
    expect(result.keyPoints).toHaveLength(2);
  });

  it('returns an existing content version before calling the AI provider', async () => {
    const completeJson = vi.fn();
    const existing = { id: 'summary-existing' };
    const store = {
      event: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'event-1',
          eventName: '广州测试马拉松',
          sourceName: '赛事官网',
          sourceUrl: 'https://race.example/notice',
          officialUrl: 'https://race.example',
          sourceLevel: 'official',
        }),
      },
      eventCandidate: { findFirst: vi.fn() },
    };
    const result = await generateEventSourceSummary('event-1', {
      store: store as never,
      fetchPage: vi.fn().mockResolvedValue({
        url: 'https://race.example/notice',
        title: '赛事公告',
        text: '赛事公告明确公布比赛日期、举办地点和参赛项目。',
      }),
      findExisting: vi.fn().mockResolvedValue(existing as never),
      completeJson,
    });
    expect(result).toEqual({ existing });
    expect(completeJson).not.toHaveBeenCalled();
  });
});

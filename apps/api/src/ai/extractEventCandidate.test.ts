import { describe, expect, it } from 'vitest';
import { buildExtractionPrompt } from './extractEventCandidate.js';

describe('buildExtractionPrompt', () => {
  it('requires evidence and forbids invented official URLs', () => {
    const prompt = buildExtractionPrompt({
      sourceName: '赛事官网',
      sourceUrl: 'https://race.example/news',
      text: '2026 广州测试马拉松将于12月20日举行。',
    });

    expect(prompt).toContain('不要编造官方入口');
    expect(prompt).toContain('每个关键字段必须给 evidence');
    expect(prompt).toContain('AI 只生成候选草稿');
  });
});

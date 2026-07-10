import { describe, expect, it } from 'vitest';
import {
  buildExtractionPrompt,
  getAiIngestProvider,
  resolveAiIngestConfig,
} from './extractEventCandidate.js';

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

  it('resolves GLM provider config from Zhipu environment variables', () => {
    const config = resolveAiIngestConfig({
      AI_INGEST_PROVIDER: 'glm',
      ZHIPUAI_API_KEY: 'test-zhipu-key',
    });

    expect(config.provider).toBe('glm');
    expect(config.model).toBe('glm-5.2');
    expect(config.baseURL).toBe('https://open.bigmodel.cn/api/paas/v4/');
  });

  it('keeps OpenAI as the default provider', () => {
    const config = resolveAiIngestConfig({
      OPENAI_API_KEY: 'test-openai-key',
    });

    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-5.5');
  });

  it('resolves DeepSeek provider config from DeepSeek environment variables', () => {
    const config = resolveAiIngestConfig({
      AI_INGEST_PROVIDER: 'deepseek',
      DEEPSEEK_API_KEY: 'test-deepseek-key',
    });

    expect(config.provider).toBe('deepseek');
    expect(config.model).toBe('deepseek-v4-flash');
    expect(config.baseURL).toBe('https://api.deepseek.com');
  });

  it('rejects DeepSeek Anthropic endpoint for OpenAI SDK mode', () => {
    expect(() =>
      resolveAiIngestConfig({
        AI_INGEST_PROVIDER: 'deepseek',
        DEEPSEEK_API_KEY: 'test-deepseek-key',
        AI_INGEST_BASE_URL: 'https://api.deepseek.com/anthropic',
      }),
    ).toThrow('不能使用 /anthropic 端点');
  });

  it('rejects unsupported AI ingest providers', () => {
    expect(() => getAiIngestProvider({ AI_INGEST_PROVIDER: 'unknown' })).toThrow(
      'AI_INGEST_PROVIDER 仅支持 openai、glm 或 deepseek',
    );
  });
});

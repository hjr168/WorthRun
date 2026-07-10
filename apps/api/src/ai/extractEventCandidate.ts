import OpenAI from 'openai';
import {
  infoStatusValues,
  runJudgementValues,
  signupStatusValues,
  sourceLevelValues,
} from '@worth-running/shared';
import { AiEventCandidate, normalizeAiCandidate } from './eventCandidateSchema.js';

type AiIngestProvider = 'openai' | 'glm' | 'deepseek';

const DEFAULT_MODELS: Record<AiIngestProvider, string> = {
  openai: 'gpt-5.5',
  glm: 'glm-5.2',
  deepseek: 'deepseek-v4-flash',
};
const DEFAULT_GLM_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4/';
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const MAX_OUTPUT_TOKENS = 2500;

export const AI_EVENT_PROMPT_VERSION = 'ai-event-candidate-v1';

export interface ExtractEventCandidateInput {
  sourceName: string;
  sourceUrl: string;
  text: string;
  cityHints?: string[];
}

export function buildExtractionPrompt(input: ExtractEventCandidateInput) {
  return [
    '你是跑步赛事信息抽取助手，任务是从来源文本中抽取赛事候选草稿。',
    'AI 只生成候选草稿，不能发布赛事，不能替代人工核验。',
    '不要编造官方入口；来源没有明确官方入口时 officialUrl 必须为 null。',
    '每个关键字段必须给 evidence，evidence.quote 必须来自来源文本。',
    '如果来源文本不是赛事公告、报名信息或赛事日历，请仍输出 JSON，但将 runJudgement 设为 unverified，并在 judgementSummary 说明信息不足。',
    '赛事信息最终必须由后台管理员人工补充和确认。',
    input.cityHints?.length ? `城市提示：${input.cityHints.join('、')}` : null,
    `来源名称：${input.sourceName}`,
    `来源 URL：${input.sourceUrl}`,
    `来源文本：${input.text}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function getAiIngestModel() {
  const provider = getAiIngestProvider();
  return process.env.AI_INGEST_MODEL || DEFAULT_MODELS[provider];
}

export function getAiIngestProvider(env: NodeJS.ProcessEnv = process.env): AiIngestProvider {
  const provider = (env.AI_INGEST_PROVIDER || 'openai').trim().toLowerCase();
  if (provider === 'openai' || provider === 'glm' || provider === 'deepseek') return provider;
  throw new Error('AI_INGEST_PROVIDER 仅支持 openai、glm 或 deepseek');
}

export interface AiIngestConfig {
  provider: AiIngestProvider;
  apiKey: string;
  model: string;
  baseURL?: string;
}

export function resolveAiIngestConfig(env: NodeJS.ProcessEnv = process.env): AiIngestConfig {
  const provider = getAiIngestProvider(env);
  const apiKey = resolveAiIngestApiKey(provider, env);
  if (!apiKey) {
    throw new Error(buildMissingApiKeyMessage(provider));
  }

  return {
    provider,
    apiKey,
    model: env.AI_INGEST_MODEL || DEFAULT_MODELS[provider],
    baseURL: validateAiIngestBaseUrl(provider, resolveAiIngestBaseUrl(provider, env)),
  };
}

export async function extractEventCandidate(
  input: ExtractEventCandidateInput,
): Promise<AiEventCandidate> {
  const config = resolveAiIngestConfig();
  if (config.provider === 'glm' || config.provider === 'deepseek') {
    return extractEventCandidateWithChatJson(input, config);
  }

  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
  const response = await client.responses.create({
    model: config.model,
    input: [
      {
        role: 'system',
        content: buildJsonOnlySystemPrompt(),
      },
      { role: 'user', content: buildExtractionPrompt(input) },
    ],
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: false,
    text: {
      format: {
        type: 'json_schema',
        name: 'worth_run_event_candidate',
        strict: true,
        schema: eventCandidateJsonSchema(),
      },
    },
  });

  const text = response.output_text;
  if (!text) {
    throw new Error('AI 抽取未返回结构化文本');
  }

  return normalizeAiCandidate(JSON.parse(text));
}

async function extractEventCandidateWithChatJson(
  input: ExtractEventCandidateInput,
  config: AiIngestConfig,
) {
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      { role: 'system', content: buildJsonOnlySystemPrompt(true) },
      { role: 'user', content: buildExtractionPrompt(input) },
    ],
    response_format: { type: 'json_object' },
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0.1,
  });

  const text = response.choices[0]?.message?.content;
  if (!text || typeof text !== 'string') {
    throw new Error(`${providerLabel(config.provider)} 抽取未返回结构化文本`);
  }

  return normalizeAiCandidate(JSON.parse(text));
}

function resolveAiIngestApiKey(provider: AiIngestProvider, env: NodeJS.ProcessEnv) {
  if (provider === 'glm') return env.AI_INGEST_API_KEY || env.ZHIPUAI_API_KEY || env.GLM_API_KEY;
  if (provider === 'deepseek') return env.AI_INGEST_API_KEY || env.DEEPSEEK_API_KEY;
  return env.AI_INGEST_API_KEY || env.OPENAI_API_KEY;
}

function resolveAiIngestBaseUrl(provider: AiIngestProvider, env: NodeJS.ProcessEnv) {
  if (provider === 'glm') {
    return env.AI_INGEST_BASE_URL || env.GLM_BASE_URL || DEFAULT_GLM_BASE_URL;
  }
  if (provider === 'deepseek') {
    return env.AI_INGEST_BASE_URL || env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL;
  }
  return env.AI_INGEST_BASE_URL || undefined;
}

function validateAiIngestBaseUrl(provider: AiIngestProvider, baseURL?: string) {
  if (provider === 'deepseek' && baseURL?.includes('/anthropic')) {
    throw new Error(
      'DeepSeek 当前使用 OpenAI SDK 兼容接口，AI_INGEST_BASE_URL 应为 https://api.deepseek.com，不能使用 /anthropic 端点',
    );
  }
  return baseURL;
}

function buildMissingApiKeyMessage(provider: AiIngestProvider) {
  if (provider === 'glm') {
    return '缺少 ZHIPUAI_API_KEY、GLM_API_KEY 或 AI_INGEST_API_KEY，无法调用 GLM 抽取服务';
  }
  if (provider === 'deepseek') {
    return '缺少 DEEPSEEK_API_KEY 或 AI_INGEST_API_KEY，无法调用 DeepSeek 抽取服务';
  }
  return '缺少 OPENAI_API_KEY 或 AI_INGEST_API_KEY，无法调用 OpenAI 抽取服务';
}

function providerLabel(provider: AiIngestProvider) {
  if (provider === 'glm') return 'GLM';
  if (provider === 'deepseek') return 'DeepSeek';
  return 'AI';
}

function buildJsonOnlySystemPrompt(includeSchema = false) {
  const base =
    '你只输出符合 schema 的 JSON。不要输出解释、Markdown 或额外文本。无法确认的信息使用 null、unknown 或空数组。';
  if (!includeSchema) return base;
  return `${base}\n\n必须符合以下 JSON Schema：\n${JSON.stringify(eventCandidateJsonSchema())}`;
}

export function eventCandidateJsonSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'eventName',
      'city',
      'eventDate',
      'distanceItems',
      'signupStatus',
      'signupDeadline',
      'officialUrl',
      'sourceName',
      'sourceUrl',
      'sourceLevel',
      'runJudgement',
      'judgementSummary',
      'judgementReasons',
      'suitableFor',
      'notSuitableFor',
      'tags',
      'evidence',
      'confidence',
    ],
    properties: {
      eventName: { type: 'string', description: '赛事名称；无法确认时用来源中最接近的名称' },
      city: { type: 'string', description: '赛事城市；无法确认时参考城市提示或填写待确认' },
      eventDate: { type: ['string', 'null'], description: 'YYYY-MM-DD；无法确认时为 null' },
      distanceItems: { type: 'array', items: { type: 'string' } },
      signupStatus: { type: 'string', enum: [...signupStatusValues] },
      signupDeadline: {
        type: ['string', 'null'],
        description: 'ISO datetime；无法确认时为 null',
      },
      officialUrl: {
        type: ['string', 'null'],
        description: '明确官方入口 URL；不得用来源 URL 冒充官方入口',
      },
      sourceName: { type: 'string' },
      sourceUrl: { type: ['string', 'null'] },
      sourceLevel: { type: 'string', enum: [...sourceLevelValues] },
      runJudgement: { type: 'string', enum: [...runJudgementValues] },
      judgementSummary: { type: 'string' },
      judgementReasons: { type: 'array', items: { type: 'string' } },
      suitableFor: { type: 'array', items: { type: 'string' } },
      notSuitableFor: { type: 'array', items: { type: 'string' } },
      tags: { type: 'array', items: { type: 'string' } },
      evidence: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['field', 'sourceUrl', 'quote'],
          properties: {
            field: { type: 'string' },
            sourceUrl: { type: 'string' },
            quote: { type: 'string', description: '必须来自来源文本，最长 300 字' },
          },
        },
      },
      confidence: {
        type: 'object',
        additionalProperties: { type: 'string', enum: [...infoStatusValues] },
      },
    },
  };
}

import OpenAI from 'openai';

export type AiIngestProvider = 'openai' | 'glm' | 'deepseek';

const DEFAULT_MODELS: Record<AiIngestProvider, string> = {
  openai: 'gpt-5.5',
  glm: 'glm-5.2',
  deepseek: 'deepseek-v4-flash',
};
const DEFAULT_GLM_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4/';
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

export interface AiIngestConfig {
  provider: AiIngestProvider;
  apiKey: string;
  model: string;
  baseURL?: string;
}

export function getAiIngestProvider(env: NodeJS.ProcessEnv = process.env): AiIngestProvider {
  const provider = (env.AI_INGEST_PROVIDER || 'openai').trim().toLowerCase();
  if (provider === 'openai' || provider === 'glm' || provider === 'deepseek') return provider;
  throw new Error('AI_INGEST_PROVIDER 仅支持 openai、glm 或 deepseek');
}

export function getAiIngestModel(env: NodeJS.ProcessEnv = process.env) {
  const provider = getAiIngestProvider(env);
  return env.AI_INGEST_MODEL || DEFAULT_MODELS[provider];
}

export function resolveAiIngestConfig(env: NodeJS.ProcessEnv = process.env): AiIngestConfig {
  const provider = getAiIngestProvider(env);
  const apiKey = resolveAiIngestApiKey(provider, env);
  if (!apiKey) throw new Error(buildMissingApiKeyMessage(provider));
  return {
    provider,
    apiKey,
    model: getAiIngestModel(env),
    baseURL: validateAiIngestBaseUrl(provider, resolveAiIngestBaseUrl(provider, env)),
  };
}

export async function completeAiJson(input: {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  config?: AiIngestConfig;
}) {
  const config = input.config ?? resolveAiIngestConfig();
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
  if (config.provider === 'glm' || config.provider === 'deepseek') {
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: `${input.system}\n\n必须符合以下 JSON Schema：\n${JSON.stringify(input.schema)}`,
        },
        { role: 'user', content: input.user },
      ],
      response_format: { type: 'json_object' },
      max_tokens: input.maxTokens,
      temperature: 0.1,
    });
    const text = response.choices[0]?.message?.content;
    if (!text || typeof text !== 'string') throw new Error('AI 未返回结构化文本');
    return JSON.parse(text) as unknown;
  }

  const response = await client.responses.create({
    model: config.model,
    input: [
      { role: 'system', content: input.system },
      { role: 'user', content: input.user },
    ],
    max_output_tokens: input.maxTokens,
    store: false,
    text: {
      format: {
        type: 'json_schema',
        name: input.schemaName,
        strict: true,
        schema: input.schema,
      },
    },
  });
  if (!response.output_text) throw new Error('AI 未返回结构化文本');
  return JSON.parse(response.output_text) as unknown;
}

function resolveAiIngestApiKey(provider: AiIngestProvider, env: NodeJS.ProcessEnv) {
  if (provider === 'glm') return env.AI_INGEST_API_KEY || env.ZHIPUAI_API_KEY || env.GLM_API_KEY;
  if (provider === 'deepseek') return env.AI_INGEST_API_KEY || env.DEEPSEEK_API_KEY;
  return env.AI_INGEST_API_KEY || env.OPENAI_API_KEY;
}

function resolveAiIngestBaseUrl(provider: AiIngestProvider, env: NodeJS.ProcessEnv) {
  if (provider === 'glm') return env.AI_INGEST_BASE_URL || env.GLM_BASE_URL || DEFAULT_GLM_BASE_URL;
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

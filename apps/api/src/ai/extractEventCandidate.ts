import {
  infoStatusValues,
  runJudgementValues,
  signupStatusValues,
  sourceLevelValues,
} from '@worth-running/shared';
import { AiEventCandidate, normalizeAiCandidate } from './eventCandidateSchema.js';
import { completeAiJson } from './aiProvider.js';
export { getAiIngestModel, getAiIngestProvider, resolveAiIngestConfig } from './aiProvider.js';
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

export async function extractEventCandidate(
  input: ExtractEventCandidateInput,
): Promise<AiEventCandidate> {
  const result = await completeAiJson({
    system:
      '你只输出符合 schema 的 JSON。不要输出解释、Markdown 或额外文本。无法确认的信息使用 null、unknown 或空数组。',
    user: buildExtractionPrompt(input),
    schemaName: 'worth_run_event_candidate',
    schema: eventCandidateJsonSchema(),
    maxTokens: MAX_OUTPUT_TOKENS,
  });
  return normalizeAiCandidate(result);
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

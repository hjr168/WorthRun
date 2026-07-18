import { createHash } from 'node:crypto';
import { prisma } from '@worth-running/database';
import type { EventSourceSummary } from '@worth-running/database';
import { z } from 'zod';
import { completeAiJson, resolveAiIngestConfig } from './ai/aiProvider.js';
import { fetchRobotsAllowedPage } from './ai/pageFetcher.js';

export const SOURCE_SUMMARY_PROMPT_VERSION = 'source-summary-v1';
const MAX_AI_INPUT_CHARS = 20_000;
const trustedSourceLevels = ['official', 'trusted'] as const;

const sourceSummarySchema = z.object({
  sourceTitle: z.string().trim().min(1).max(120).nullable(),
  summary: z.string().trim().min(80).max(400),
  keyPoints: z.array(z.string().trim().min(1).max(120)).min(2).max(6),
  limitations: z.string().trim().min(1).max(200).nullable(),
});

export type SourceSummaryContent = z.infer<typeof sourceSummarySchema>;

export class SourceSummaryGenerationError extends Error {}

export function compressSourceText(text: string, maxChars = MAX_AI_INPUT_CHARS) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  const headSize = Math.floor(maxChars * 0.65);
  const keywordPattern = /(报名|日期|时间|地点|路线|组别|距离|截止|资格|领取|交通)/g;
  const excerpts: string[] = [];
  let match: RegExpExecArray | null;
  while (
    (match = keywordPattern.exec(normalized)) &&
    excerpts.join('').length < maxChars - headSize
  ) {
    const start = Math.max(headSize, match.index - 180);
    excerpts.push(normalized.slice(start, start + 520));
  }
  return `${normalized.slice(0, headSize)} ${excerpts.join(' ')}`.slice(0, maxChars).trim();
}

export function sourceContentHash(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

export function parseSourceSummaryContent(value: unknown): SourceSummaryContent {
  return sourceSummarySchema.parse(value);
}

export function sourceSummaryJsonSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['sourceTitle', 'summary', 'keyPoints', 'limitations'],
    properties: {
      sourceTitle: { type: ['string', 'null'], maxLength: 120 },
      summary: { type: 'string', minLength: 80, maxLength: 400 },
      keyPoints: {
        type: 'array',
        minItems: 2,
        maxItems: 6,
        items: { type: 'string', minLength: 1, maxLength: 120 },
      },
      limitations: { type: ['string', 'null'], maxLength: 200 },
    },
  };
}

export async function generateEventSourceSummary(
  eventId: string,
  deps: {
    store?: typeof prisma;
    fetchPage?: typeof fetchRobotsAllowedPage;
    completeJson?: typeof completeAiJson;
    findExisting?: (identity: {
      eventId: string;
      contentHash: string;
      promptVersion: string;
    }) => Promise<EventSourceSummary | null>;
    now?: Date;
  } = {},
) {
  const store = deps.store ?? prisma;
  const event = await store.event.findUnique({ where: { id: eventId } });
  if (!event) throw new SourceSummaryGenerationError('赛事不存在');
  if (!trustedSourceLevels.includes(event.sourceLevel as (typeof trustedSourceLevels)[number])) {
    throw new SourceSummaryGenerationError('来源等级不足，不能生成公开摘要');
  }

  const sourceUrl = validHttpUrl(event.sourceUrl) ?? validHttpUrl(event.officialUrl);
  if (!sourceUrl) throw new SourceSummaryGenerationError('赛事缺少可核验的来源链接');

  let basis: 'page_text' | 'stored_source_record' = 'page_text';
  let sourceTitle: string | null = null;
  let rawText = '';
  try {
    const hostname = new URL(sourceUrl).hostname;
    const page = await (deps.fetchPage ?? fetchRobotsAllowedPage)(sourceUrl, [hostname]);
    rawText = page.text;
    sourceTitle = page.title || null;
  } catch {
    const candidate = await store.eventCandidate.findFirst({
      where: {
        acceptedEventId: event.id,
        source: { sourceLevel: { in: [...trustedSourceLevels] } },
      },
      select: {
        extractedData: true,
        evidence: true,
        rawPayload: true,
        source: { select: { name: true, entryUrl: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!candidate) {
      throw new SourceSummaryGenerationError('来源页面不可抓取，且没有可用的已保存官方来源记录');
    }
    basis = 'stored_source_record';
    rawText = JSON.stringify({
      extractedData: candidate.extractedData,
      evidence: candidate.evidence,
      rawPayload: candidate.rawPayload,
    });
  }

  const sourceText = compressSourceText(rawText);
  if (!sourceText) throw new SourceSummaryGenerationError('来源内容为空，无法生成摘要');
  const contentHash = sourceContentHash(sourceText);
  const existing = await deps.findExisting?.({
    eventId: event.id,
    contentHash,
    promptVersion: SOURCE_SUMMARY_PROMPT_VERSION,
  });
  if (existing) return { existing } as const;
  const config = resolveAiIngestConfig();
  const result = await (deps.completeJson ?? completeAiJson)({
    system:
      '你是赛事来源摘要助手，只能依据给定来源内容生成结构化摘要。不得推测报名状态、名额、路线、认证等级或截止时间，不得输出推荐报名或值得跑结论。只输出 JSON。',
    user: [
      `赛事名称：${event.eventName}`,
      `来源名称：${event.sourceName}`,
      `来源链接：${sourceUrl}`,
      `生成依据：${basis}`,
      `来源标题：${sourceTitle ?? '未提供'}`,
      `来源内容：${sourceText}`,
    ].join('\n\n'),
    schemaName: 'worth_run_source_summary',
    schema: sourceSummaryJsonSchema(),
    maxTokens: 1200,
    config,
  });
  const content = parseSourceSummaryContent(result);
  return {
    generated: {
      eventId: event.id,
      basis,
      sourceName: event.sourceName,
      sourceUrl,
      sourceTitle: content.sourceTitle ?? sourceTitle,
      summary: content.summary,
      keyPoints: content.keyPoints,
      limitations: content.limitations,
      contentHash,
      aiProvider: config.provider,
      aiModel: config.model,
      promptVersion: SOURCE_SUMMARY_PROMPT_VERSION,
      fetchedAt: deps.now ?? new Date(),
    },
  } as const;
}

function validHttpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

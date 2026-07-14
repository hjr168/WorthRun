import { prisma } from '@worth-running/database';
import type { EventSource } from '@worth-running/database';
import { AI_EVENT_PROMPT_VERSION, extractEventCandidate, getAiIngestModel } from './extractEventCandidate.js';
import { fetchRobotsAllowedPage, normalizeAllowedDomains } from './pageFetcher.js';
import { persistEventCandidates } from './persistEventCandidates.js';
import type { PersistSummary } from './persistEventCandidates.js';
import { fetchChinaAthOfficialCandidates } from './sources/chinaAthOfficial.js';
import type { SourceCandidateBatch } from './sources/sourceCandidate.js';

export class AiIngestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function buildCandidateFingerprint(eventName: string, city: string, eventDate: string | null) {
  return [eventName.trim(), city.trim(), eventDate || 'unknown-date'].join('|');
}

export interface EventSourceRunSummary extends PersistSummary {
  sourceId: string;
  totalAvailable: number | null;
}

export async function runEventSource(sourceId: string): Promise<EventSourceRunSummary> {
  const source = await prisma.eventSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new AiIngestError(404, '赛事源不存在');
  if (source.status !== 'active') throw new AiIngestError(400, '赛事源未启用');

  try {
    const batch = await fetchSourceCandidateBatch(source);
    const persisted = await persistEventCandidates(source.id, batch.candidates);
    const summary: EventSourceRunSummary = {
      sourceId: source.id,
      totalAvailable: batch.totalAvailable,
      ...persisted,
    };

    await prisma.eventSource.update({
      where: { id: source.id },
      data: {
        lastRunAt: new Date(),
        lastRunStatus: formatRunStatus(summary),
      },
    });

    return summary;
  } catch (error) {
    const ingestError =
      error instanceof AiIngestError
        ? error
        : new AiIngestError(inferStatus(error), errorMessage(error));
    await prisma.eventSource
      .update({
        where: { id: source.id },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: `failed:${ingestError.message.slice(0, 180)}`,
        },
      })
      .catch(() => undefined);
    throw ingestError;
  }
}

async function fetchSourceCandidateBatch(source: EventSource): Promise<SourceCandidateBatch> {
  if (source.sourceType === 'chinaath_api') {
    return fetchChinaAthOfficialCandidates({ cityHints: source.cityHints });
  }
  if (source.sourceType !== 'page_url') {
    throw new AiIngestError(400, '当前仅支持页面 URL 和中国田协官方接口赛事源');
  }
  if (!source.entryUrl) {
    throw new AiIngestError(400, '页面 URL 赛事源缺少入口 URL');
  }

  const allowedDomains = allowedDomainsForSource(source.entryUrl, source.allowedDomains);
  const page = await fetchRobotsAllowedPage(source.entryUrl, allowedDomains);
  if (!page.text || page.text.length < 20) {
    throw new AiIngestError(422, '来源页面正文过短，无法抽取赛事信息');
  }

  const extracted = await extractEventCandidate({
    sourceName: source.name,
    sourceUrl: page.url,
    text: page.text,
    cityHints: source.cityHints,
  });
  const candidate = {
    ...extracted,
    sourceName: extracted.sourceName || source.name,
    sourceUrl: extracted.sourceUrl || page.url,
  };

  return {
    totalAvailable: 1,
    pageNo: null,
    pageSize: null,
    pageCount: 1,
    candidates: [
      {
        candidate,
        sourceExternalId: null,
        rawPayload: null,
        extractorVersion: AI_EVENT_PROMPT_VERSION,
        aiModel: getAiIngestModel(),
        aiPromptVersion: AI_EVENT_PROMPT_VERSION,
      },
    ],
  };
}

export function formatRunStatus(summary: EventSourceRunSummary) {
  return [
    `success:fetched=${summary.fetched}`,
    `created=${summary.created}`,
    `updated=${summary.updated}`,
    `skipped=${summary.skippedReviewed}`,
    `duplicates=${summary.duplicateEvents}`,
  ].join(',');
}

function allowedDomainsForSource(entryUrl: string, allowedDomains: string[]) {
  const normalized = normalizeAllowedDomains(allowedDomains);
  if (normalized.length > 0) return normalized;
  return [new URL(entryUrl).hostname.toLowerCase()];
}

function inferStatus(error: unknown) {
  const message = errorMessage(error);
  if (
    message.includes('OPENAI_API_KEY') ||
    message.includes('ZHIPUAI_API_KEY') ||
    message.includes('GLM_API_KEY') ||
    message.includes('DEEPSEEK_API_KEY') ||
    message.includes('AI_INGEST_API_KEY')
  ) {
    return 503;
  }
  if (message.includes('robots.txt') || message.includes('不在允许域名')) return 403;
  if (message.includes('访问验证') || message.includes('验证码')) return 403;
  if (message.includes('不是可解析') || message.includes('正文过短')) return 422;
  return 502;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'AI 赛事源抽取失败';
}

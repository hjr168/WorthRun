import { prisma } from '@worth-running/database';
import type { EventSource } from '@worth-running/database';
import { acquireEventSourceLease, releaseEventSourceLease } from './eventSourceLease.js';
import { failureBackoffMs, nextPageAfterRun } from './eventSourceOperations.js';
import {
  AI_EVENT_PROMPT_VERSION,
  extractEventCandidate,
  getAiIngestModel,
} from './extractEventCandidate.js';
import { fetchRobotsAllowedPage, normalizeAllowedDomains } from './pageFetcher.js';
import { persistEventCandidates } from './persistEventCandidates.js';
import type { PersistSummary } from './persistEventCandidates.js';
import { fetchChinaAthOfficialCandidates } from './sources/chinaAthOfficial.js';
import type { SourceCandidate, SourceCandidateBatch } from './sources/sourceCandidate.js';

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
  runId: string;
  sourceId: string;
  trigger: 'manual' | 'scheduled';
  totalAvailable: number | null;
  startPage: number | null;
  endPage: number | null;
  pageCount: number;
  nextPage: number;
}

interface RunStore {
  eventSource: {
    findUnique(args: unknown): Promise<EventSource | null>;
    update(args: unknown): Promise<unknown>;
  };
  eventSourceRun: {
    create(args: unknown): Promise<{ id: string }>;
    update(args: unknown): Promise<unknown>;
  };
}

interface RunEventSourceDependencies {
  store: RunStore;
  acquireLease: typeof acquireEventSourceLease;
  releaseLease: typeof releaseEventSourceLease;
  fetchChinaAth: typeof fetchChinaAthOfficialCandidates;
  persistCandidates: typeof persistEventCandidates;
  fetchPageCandidate: (source: EventSource) => Promise<SourceCandidateBatch>;
  clock: () => Date;
}

interface RunEventSourceOptions {
  trigger?: 'manual' | 'scheduled';
  now?: Date;
  dependencies?: Partial<RunEventSourceDependencies>;
}

export async function runEventSource(
  sourceId: string,
  options: RunEventSourceOptions = {},
): Promise<EventSourceRunSummary> {
  const dependencies = resolveDependencies(options.dependencies);
  const trigger = options.trigger ?? 'manual';
  const startedAt = options.now ?? dependencies.clock();
  const source = await dependencies.store.eventSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new AiIngestError(404, '赛事源不存在');
  if (source.status !== 'active') throw new AiIngestError(400, '赛事源未启用');

  const lease = await dependencies.acquireLease(source.id, startedAt);
  if (!lease) throw new AiIngestError(409, '赛事源正在运行');

  let runId: string | null = null;
  try {
    const run = await dependencies.store.eventSourceRun.create({
      data: { sourceId: source.id, trigger, status: 'running', startedAt },
      select: { id: true },
    });
    runId = run.id;

    const result =
      source.sourceType === 'chinaath_api'
        ? await runChinaAthPages(source, startedAt, dependencies)
        : await runSinglePageSource(source, startedAt, dependencies);
    const finishedAt = dependencies.clock();
    const summary: EventSourceRunSummary = {
      runId,
      sourceId: source.id,
      trigger,
      ...result,
    };

    await dependencies.store.eventSourceRun.update({
      where: { id: runId },
      data: {
        status: 'succeeded',
        finishedAt,
        startPage: summary.startPage,
        endPage: summary.endPage,
        pageCount: summary.pageCount,
        totalAvailable: summary.totalAvailable,
        fetched: summary.fetched,
        created: summary.created,
        updated: summary.updated,
        skippedReviewed: summary.skippedReviewed,
        duplicateEvents: summary.duplicateEvents,
      },
    });
    await dependencies.store.eventSource.update({
      where: { id: source.id },
      data: {
        nextPage: summary.nextPage,
        nextRunAt: source.scheduleEnabled
          ? new Date(finishedAt.getTime() + source.scheduleIntervalHours * 60 * 60 * 1000)
          : null,
        lastRunAt: finishedAt,
        lastSuccessAt: finishedAt,
        lastRunStatus: formatRunStatus(summary),
        consecutiveFailures: 0,
      },
    });

    return summary;
  } catch (error) {
    const ingestError = toAiIngestError(error);
    const finishedAt = dependencies.clock();
    const consecutiveFailures = source.consecutiveFailures + 1;
    if (runId) {
      await dependencies.store.eventSourceRun
        .update({
          where: { id: runId },
          data: {
            status: 'failed',
            finishedAt,
            errorMessage: ingestError.message.slice(0, 500),
          },
        })
        .catch(() => undefined);
    }
    await dependencies.store.eventSource
      .update({
        where: { id: source.id },
        data: {
          lastRunAt: finishedAt,
          lastRunStatus: `failed:${ingestError.message.slice(0, 180)}`,
          consecutiveFailures,
          nextRunAt: source.scheduleEnabled
            ? new Date(finishedAt.getTime() + failureBackoffMs(consecutiveFailures))
            : null,
        },
      })
      .catch(() => undefined);
    throw ingestError;
  } finally {
    await dependencies.releaseLease(source.id, lease.token).catch(() => undefined);
  }
}

async function runChinaAthPages(
  source: EventSource,
  now: Date,
  dependencies: RunEventSourceDependencies,
) {
  const startPage = Math.max(1, source.nextPage);
  const pageSize = Math.min(Math.max(source.pageSize, 1), 20);
  const maxPages = Math.min(Math.max(source.maxPagesPerRun, 1), 2);
  const totals = emptyPersistSummary();
  let currentPage = startPage;
  let endPage = startPage;
  let processedPages = 0;
  let remotePageCount: number | null = null;
  let totalAvailable: number | null = null;

  while (processedPages < maxPages) {
    const batch = await dependencies.fetchChinaAth({
      pageNo: currentPage,
      pageSize,
      cityHints: source.cityHints,
    });
    processedPages += 1;
    endPage = batch.pageNo ?? currentPage;
    remotePageCount = batch.pageCount;
    totalAvailable = batch.totalAvailable;
    const persisted = await dependencies.persistCandidates(source.id, batch.candidates, now);
    mergePersistSummary(totals, persisted);

    if (remotePageCount !== null && (remotePageCount === 0 || endPage >= remotePageCount)) break;
    currentPage = endPage + 1;
  }

  return {
    ...totals,
    totalAvailable,
    startPage,
    endPage,
    pageCount: processedPages,
    nextPage: nextPageAfterRun({ endPage, remotePageCount }),
  };
}

async function runSinglePageSource(
  source: EventSource,
  now: Date,
  dependencies: RunEventSourceDependencies,
) {
  const batch = await dependencies.fetchPageCandidate(source);
  const persisted = await dependencies.persistCandidates(source.id, batch.candidates, now);
  return {
    ...persisted,
    totalAvailable: batch.totalAvailable,
    startPage: null,
    endPage: null,
    pageCount: 1,
    nextPage: source.nextPage,
  };
}

function emptyPersistSummary(): PersistSummary {
  return {
    fetched: 0,
    created: 0,
    updated: 0,
    skippedReviewed: 0,
    duplicateEvents: 0,
    candidateIds: [],
  };
}

function mergePersistSummary(target: PersistSummary, value: PersistSummary) {
  target.fetched += value.fetched;
  target.created += value.created;
  target.updated += value.updated;
  target.skippedReviewed += value.skippedReviewed;
  target.duplicateEvents += value.duplicateEvents;
  target.candidateIds.push(...value.candidateIds);
}

async function fetchPageCandidate(source: EventSource): Promise<SourceCandidateBatch> {
  if (source.sourceType !== 'page_url') {
    throw new AiIngestError(400, '当前仅支持页面 URL 和中国田协官方接口赛事源');
  }
  if (!source.entryUrl) throw new AiIngestError(400, '页面 URL 赛事源缺少入口 URL');

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
  const candidate: SourceCandidate = {
    candidate: {
      ...extracted,
      sourceName: extracted.sourceName || source.name,
      sourceUrl: extracted.sourceUrl || page.url,
    },
    sourceExternalId: null,
    rawPayload: null,
    extractorVersion: AI_EVENT_PROMPT_VERSION,
    aiModel: getAiIngestModel(),
    aiPromptVersion: AI_EVENT_PROMPT_VERSION,
  };

  return {
    totalAvailable: 1,
    pageNo: null,
    pageSize: null,
    pageCount: 1,
    candidates: [candidate],
  };
}

function resolveDependencies(overrides: Partial<RunEventSourceDependencies> = {}) {
  return {
    store: prisma as unknown as RunStore,
    acquireLease: acquireEventSourceLease,
    releaseLease: releaseEventSourceLease,
    fetchChinaAth: fetchChinaAthOfficialCandidates,
    persistCandidates: persistEventCandidates,
    fetchPageCandidate,
    clock: () => new Date(),
    ...overrides,
  };
}

export function formatRunStatus(summary: Pick<PersistSummary, keyof PersistSummary>) {
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

function toAiIngestError(error: unknown) {
  return error instanceof AiIngestError
    ? error
    : new AiIngestError(inferStatus(error), errorMessage(error));
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

import { EventCandidateStatus, Prisma, prisma } from '@worth-running/database';
import { AI_EVENT_PROMPT_VERSION, extractEventCandidate, getAiIngestModel } from './extractEventCandidate.js';
import { fetchRobotsAllowedPage, normalizeAllowedDomains } from './pageFetcher.js';

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

export async function runEventSource(sourceId: string) {
  const source = await prisma.eventSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new AiIngestError(404, '赛事源不存在');
  if (source.status !== 'active') throw new AiIngestError(400, '赛事源未启用');

  try {
    if (source.sourceType !== 'page_url') {
      throw new AiIngestError(400, '当前仅支持页面 URL 赛事源；搜索关键词和 RSS 将在后续接入');
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
    const eventDate = candidate.eventDate
      ? new Date(`${candidate.eventDate}T00:00:00.000Z`)
      : null;
    const duplicate = eventDate
      ? await prisma.event.findFirst({
          where: {
            eventName: candidate.eventName,
            city: candidate.city,
            eventDate,
          },
          select: { id: true },
        })
      : null;
    const candidateStatus = duplicate
      ? EventCandidateStatus.needs_review
      : EventCandidateStatus.new;
    const existingCandidate = await prisma.eventCandidate.findFirst({
      where: {
        sourceId: source.id,
        status: { in: [EventCandidateStatus.new, EventCandidateStatus.needs_review] },
        eventName: candidate.eventName,
        city: candidate.city,
        eventDate,
      },
      orderBy: { createdAt: 'desc' },
    });
    const data = {
      sourceId: source.id,
      status: existingCandidate ? EventCandidateStatus.needs_review : candidateStatus,
      eventName: candidate.eventName,
      city: candidate.city,
      eventDate,
      sourceUrl: candidate.sourceUrl,
      officialUrl: candidate.officialUrl,
      extractedData: candidate as Prisma.InputJsonObject,
      evidence: candidate.evidence as Prisma.InputJsonArray,
      confidence: candidate.confidence as Prisma.InputJsonObject,
      duplicateEventId: duplicate?.id ?? null,
      aiModel: getAiIngestModel(),
      aiPromptVersion: AI_EVENT_PROMPT_VERSION,
    };
    const saved = existingCandidate
      ? await prisma.eventCandidate.update({
          where: { id: existingCandidate.id },
          data,
        })
      : await prisma.eventCandidate.create({ data });

    await prisma.eventSource.update({
      where: { id: source.id },
      data: {
        lastRunAt: new Date(),
        lastRunStatus: `success:${saved.id}`,
      },
    });

    return saved;
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

function allowedDomainsForSource(entryUrl: string, allowedDomains: string[]) {
  const normalized = normalizeAllowedDomains(allowedDomains);
  if (normalized.length > 0) return normalized;
  return [new URL(entryUrl).hostname.toLowerCase()];
}

function inferStatus(error: unknown) {
  const message = errorMessage(error);
  if (message.includes('OPENAI_API_KEY')) return 503;
  if (message.includes('robots.txt') || message.includes('不在允许域名')) return 403;
  if (message.includes('不是可解析') || message.includes('正文过短')) return 422;
  return 502;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'AI 赛事源抽取失败';
}

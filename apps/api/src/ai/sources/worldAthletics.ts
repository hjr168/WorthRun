import { chinaDateOnly } from '@worth-running/shared';
import { z } from 'zod';
import { WORLD_ATHLETICS_CALENDAR_URL } from '../eventSourceConfig.js';
import { readResponseTextLimited } from '../pageFetcher.js';
import type { SourceCandidateBatch } from './sourceCandidate.js';

const HONG_KONG_REGION_ID = 13188432;
const MAX_HTML_BYTES = 300_000;

const calendarEventSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string().trim().min(1),
  venue: z.string().nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().nullable().optional(),
  rankingCategory: z.string().nullable().optional(),
  disciplines: z.string().nullable().optional(),
  competitionGroup: z.string().nullable().optional(),
});

interface FetchWorldAthleticsOptions {
  fetchImpl?: typeof fetch;
  now?: Date;
  pageSize?: number;
}

export async function fetchWorldAthleticsCandidates(
  options: FetchWorldAthleticsOptions = {},
): Promise<SourceCandidateBatch> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 20);
  const startDate = addDays(chinaDateOnly(now), 1);
  const endDate = addDays(startDate, 365);
  const url = new URL(WORLD_ATHLETICS_CALENDAR_URL);
  url.searchParams.set('disciplineId', '2');
  url.searchParams.set('regionType', 'country');
  url.searchParams.set('regionId', String(HONG_KONG_REGION_ID));
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);

  const response = await fetchImpl(url, {
    headers: { 'user-agent': process.env.AI_INGEST_USER_AGENT || 'WorthRunBot/0.1' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`世界田联赛事日历请求失败：HTTP ${response.status}`);
  const html = await readResponseTextLimited(response, MAX_HTML_BYTES);
  if (new TextEncoder().encode(html).byteLength >= MAX_HTML_BYTES) {
    throw new Error('世界田联赛事日历超过 300KB 安全上限');
  }
  return parseWorldAthleticsHtml(html, { url: url.toString(), startDate, endDate, pageSize });
}

export function parseWorldAthleticsHtml(
  html: string,
  options: { url: string; startDate: string; endDate: string; pageSize: number },
): SourceCandidateBatch {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('世界田联赛事日历缺少结构化数据');

  let payload: unknown;
  try {
    payload = JSON.parse(match[1]);
  } catch {
    throw new Error('世界田联赛事日历结构化数据无法解析');
  }
  const rawResults = readInitialResults(payload);
  const parsed = z.array(calendarEventSchema).safeParse(rawResults);
  if (!parsed.success) throw new Error('世界田联赛事日历结构发生变化');

  const records = parsed.data.filter(
    (event) =>
      event.startDate >= options.startDate &&
      event.startDate <= options.endDate &&
      /Hong Kong|HKG/i.test(event.venue || '') &&
      /Road Running/i.test(event.disciplines || ''),
  );

  return {
    totalAvailable: records.length,
    pageNo: null,
    pageSize: options.pageSize,
    pageCount: 1,
    candidates: records.slice(0, options.pageSize).map((event) => {
      const quote = [event.name, event.startDate, event.venue, event.rankingCategory]
        .filter(Boolean)
        .join('；')
        .slice(0, 300);
      return {
        sourceExternalId: `world-athletics-${event.id}`,
        rawPayload: { ...event },
        extractorVersion: 'world-athletics-v1',
        aiModel: null,
        aiPromptVersion: null,
        candidate: {
          eventName: event.name,
          city: '香港',
          eventDate: event.startDate,
          distanceItems: inferDistanceItems(event.name),
          signupStatus: 'unknown' as const,
          signupDeadline: null,
          officialUrl: null,
          sourceName: '世界田联香港路跑日历',
          sourceUrl: options.url,
          sourceLevel: 'official' as const,
          runJudgement: 'unverified' as const,
          judgementSummary: '赛事记录来自世界田联日历；报名状态和主办方入口仍需人工核验。',
          judgementReasons: ['赛事名称、比赛日期和举办地来自世界田联日历'],
          suitableFor: [],
          notSuitableFor: [],
          tags: [event.rankingCategory ? `世界田联${event.rankingCategory}` : '世界田联'].filter(
            Boolean,
          ),
          evidence: [{ field: 'sourceRecord', sourceUrl: options.url, quote }],
          confidence: {
            eventName: 'verified' as const,
            city: 'verified' as const,
            eventDate: 'verified' as const,
            distanceItems: 'pending_verify' as const,
            officialUrl: 'pending_verify' as const,
            signupStatus: 'pending_verify' as const,
          },
        },
      };
    }),
  };
}

function readInitialResults(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return null;
  const props = (payload as { props?: unknown }).props;
  if (!props || typeof props !== 'object') return null;
  const pageProps = (props as { pageProps?: unknown }).pageProps;
  if (!pageProps || typeof pageProps !== 'object') return null;
  const initialEvents = (pageProps as { initialEvents?: unknown }).initialEvents;
  if (!initialEvents || typeof initialEvents !== 'object') return null;
  return (initialEvents as { results?: unknown }).results;
}

function inferDistanceItems(name: string) {
  const distances: string[] = [];
  if (/half[ -]?marathon|半程/i.test(name)) distances.push('半程马拉松');
  if (/\b10\s*k(?:m)?\b|10公里/i.test(name)) distances.push('10公里');
  if (/marathon|马拉松/i.test(name) && !/half[ -]?marathon|半程/i.test(name)) {
    distances.push('马拉松');
  }
  return distances;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

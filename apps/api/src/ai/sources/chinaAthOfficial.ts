import { z } from 'zod';
import { CHINAATH_PUBLIC_LIST_URL } from '../eventSourceConfig.js';
import type { SourceCandidateBatch } from './sourceCandidate.js';

const CHINAATH_LIST_ENDPOINT =
  'https://api-changzheng.chinaath.com/changzheng-content-center-api/api/homePage/official/searchCompetitionMls';
const DEFAULT_BATCH_SIZE = 20;

const raceSchema = z.object({
  raceId: z.union([z.number(), z.string()]),
  raceName: z.string().trim().min(1),
  raceGrade: z.string().nullable().optional(),
  raceTime: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  raceAddress: z.string().nullable().optional(),
  raceItem: z.string().nullable().optional(),
  raceScale: z.union([z.string(), z.number()]).nullable().optional(),
});

const responseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    results: z.array(raceSchema),
    totalCount: z.number().int().nonnegative(),
    pageNo: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().optional(),
    pageCount: z.number().int().nonnegative().optional(),
  }),
});

interface FetchChinaAthOptions {
  fetchImpl?: typeof fetch;
  pageNo?: number;
  pageSize?: number;
  cityHints?: string[];
}

export async function fetchChinaAthOfficialCandidates(
  options: FetchChinaAthOptions = {},
): Promise<SourceCandidateBatch> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pageNo = options.pageNo ?? 1;
  const pageSize = Math.min(Math.max(options.pageSize ?? DEFAULT_BATCH_SIZE, 1), 20);
  const response = await fetchImpl(CHINAATH_LIST_ENDPOINT, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': process.env.AI_INGEST_USER_AGENT || 'WorthRunBot/0.1',
    },
    body: JSON.stringify({
      provinceId: '',
      cityId: '',
      districtId: '',
      raceName: '',
      raceGrade: '',
      raceStartTime: '',
      pageNo,
      pageSize,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`中国田协赛事接口请求失败：HTTP ${response.status}`);
  }

  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('中国田协赛事接口返回失败或结构不符合预期');
  }

  const hints = (options.cityHints ?? []).map(normalizeCityHint).filter(Boolean);
  const data = parsed.data.data;
  const records = hints.length
    ? data.results.filter((race) => {
        const haystack = `${race.raceName} ${race.raceAddress || ''}`;
        return hints.some((hint) => haystack.includes(hint));
      })
    : data.results;
  const remotePageSize = data.pageSize ?? pageSize;

  return {
    totalAvailable: data.totalCount,
    pageNo: data.pageNo ?? pageNo,
    pageSize: remotePageSize,
    pageCount: data.pageCount ?? Math.ceil(data.totalCount / remotePageSize),
    candidates: records.map((race) => {
      const city = parseCity(race.raceAddress);
      const distances = parseRaceItems(race.raceItem);
      const quote = [race.raceName, race.raceTime, race.raceAddress, race.raceItem]
        .filter(Boolean)
        .join('；')
        .slice(0, 300);

      return {
        sourceExternalId: String(race.raceId),
        rawPayload: { ...race },
        extractorVersion: 'chinaath-api-v1',
        aiModel: null,
        aiPromptVersion: null,
        candidate: {
          eventName: race.raceName,
          city,
          eventDate: race.raceTime,
          distanceItems: distances,
          signupStatus: 'unknown' as const,
          signupDeadline: null,
          officialUrl: null,
          sourceName: '中国田协官方赛事目录',
          sourceUrl: CHINAATH_PUBLIC_LIST_URL,
          sourceLevel: 'official' as const,
          runJudgement: 'unverified' as const,
          judgementSummary: '中国田协赛事目录记录；报名状态和官方报名入口仍需人工确认。',
          judgementReasons: ['赛事名称、日期、地点和项目来自中国田协赛事目录'],
          suitableFor: [],
          notSuitableFor: [],
          tags: race.raceGrade ? [`田协${race.raceGrade}类`] : [],
          evidence: [{ field: 'sourceRecord', sourceUrl: CHINAATH_PUBLIC_LIST_URL, quote }],
          confidence: {
            eventName: 'verified' as const,
            city: 'verified' as const,
            eventDate: 'verified' as const,
            distanceItems: distances.length ? ('verified' as const) : ('pending_verify' as const),
            officialUrl: 'pending_verify' as const,
            signupStatus: 'pending_verify' as const,
          },
        },
      };
    }),
  };
}

function parseCity(address?: string | null) {
  const parts = String(address || '')
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean);
  return parts[1] || parts[0] || '待确认';
}

function parseRaceItems(value?: string | null) {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0,
        )
      : [];
  } catch {
    return value
      .split(/[,，、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function normalizeCityHint(value: string) {
  return value.trim().replace(/[市区县]$/, '');
}

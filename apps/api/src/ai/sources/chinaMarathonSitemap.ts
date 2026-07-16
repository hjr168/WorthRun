import * as cheerio from 'cheerio';
import { detectGreaterBayAreaCity } from '@worth-running/shared';
import { CHINAMARATHON_SITEMAP_URL } from '../eventSourceConfig.js';
import { fetchRobotsAllowedPage, readResponseTextLimited } from '../pageFetcher.js';
import type { FetchedPage } from '../pageFetcher.js';
import type { SourceCandidate, SourceCandidateBatch } from './sourceCandidate.js';

const MAX_SITEMAP_BYTES = 100_000;
const MAX_DETAIL_PAGES = 10;
const DISCOVERY_KEYWORDS = [
  '广州',
  '深圳',
  '珠海',
  '佛山',
  '惠州',
  '东莞',
  '中山',
  '江门',
  '肇庆',
  '香港',
  '澳门',
  '港珠澳',
  '顺德',
  '横琴',
  '黄埔',
  '南山',
  '虎门',
  '松山湖',
];

interface FetchChinaMarathonOptions {
  fetchImpl?: typeof fetch;
  fetchPage?: (url: string, domains: string[]) => Promise<FetchedPage>;
  pageSize?: number;
}

interface SitemapRecord {
  url: string;
  externalId: string;
  title: string;
  lastmod: string | null;
}

export async function fetchChinaMarathonSitemapCandidates(
  options: FetchChinaMarathonOptions = {},
): Promise<SourceCandidateBatch> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const fetchPage = options.fetchPage ?? fetchRobotsAllowedPage;
  const pageSize = Math.min(Math.max(options.pageSize ?? MAX_DETAIL_PAGES, 1), MAX_DETAIL_PAGES);
  const response = await fetchImpl(CHINAMARATHON_SITEMAP_URL, {
    headers: { 'user-agent': process.env.AI_INGEST_USER_AGENT || 'WorthRunBot/0.1' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`中国马拉松 sitemap 请求失败：HTTP ${response.status}`);
  const xml = await readResponseTextLimited(response, MAX_SITEMAP_BYTES);
  if (new TextEncoder().encode(xml).byteLength >= MAX_SITEMAP_BYTES) {
    throw new Error('中国马拉松 sitemap 超过 100KB 安全上限');
  }

  const records = parseSitemap(xml).filter((record) =>
    DISCOVERY_KEYWORDS.some((keyword) => record.title.includes(keyword)),
  );
  records.sort((a, b) => String(b.lastmod || '').localeCompare(String(a.lastmod || '')));

  const candidates = new Map<string, SourceCandidate>();
  for (const record of records.slice(0, pageSize)) {
    const page = await fetchPage(record.url, ['chinamarathon.com', 'heilianapp.com']);
    const parsed = parseChinaMarathonDetail(page.text, record);
    if (!parsed) continue;
    const fingerprint = [parsed.candidate.eventName, parsed.candidate.city].join('|');
    const existing = candidates.get(fingerprint);
    if (!existing || (!existing.candidate.eventDate && parsed.candidate.eventDate)) {
      candidates.set(fingerprint, parsed);
    }
  }

  return {
    candidates: [...candidates.values()],
    totalAvailable: records.length,
    pageNo: null,
    pageSize,
    pageCount: 1,
  };
}

export function parseSitemap(xml: string): SitemapRecord[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const records: SitemapRecord[] = [];
  $('url').each((_, element) => {
    const url = $(element).find('loc').first().text().trim();
    const title = $(element).find('image\\:title, title').first().text().trim();
    const externalId = url.match(/\/events\/(\d+)/)?.[1];
    if (!url || !title || !externalId) return;
    records.push({
      url,
      externalId,
      title,
      lastmod: $(element).find('lastmod').first().text().trim() || null,
    });
  });
  return records;
}

export function parseChinaMarathonDetail(
  text: string,
  record: SitemapRecord,
): SourceCandidate | null {
  const location = text.match(/比赛地点\s*(.*?)\s*赛事类型/)?.[1]?.trim() || '';
  const city = detectGreaterBayAreaCity(location);
  if (!city) return null;

  const originalDate = parseChineseDate(text);
  const titleYear = record.title.match(/(?:^|\D)(20\d{2})(?:\D|$)/)?.[1] || null;
  const dateConflict = Boolean(originalDate && titleYear && !originalDate.startsWith(titleYear));
  const eventDate = dateConflict ? null : originalDate;
  const eventName = normalizeAggregatorEventName(record.title);
  const quote = [record.title, originalDate, location].filter(Boolean).join('；').slice(0, 300);

  return {
    sourceExternalId: `chinamarathon-${record.externalId}`,
    rawPayload: {
      title: record.title,
      lastmod: record.lastmod,
      location,
      originalDate,
    },
    extractorVersion: 'chinamarathon-sitemap-v1',
    aiModel: null,
    aiPromptVersion: null,
    reviewIssues: dateConflict ? ['source_date_conflict'] : [],
    candidate: {
      eventName,
      city,
      eventDate,
      distanceItems: inferDistanceItems(`${record.title} ${text.slice(0, 2000)}`),
      signupStatus: 'unknown',
      signupDeadline: null,
      officialUrl: null,
      sourceName: '中国马拉松社区赛事发现',
      sourceUrl: record.url,
      sourceLevel: 'community',
      runJudgement: 'unverified',
      judgementSummary: dateConflict
        ? '聚合页标题年份与比赛日期冲突，已清空日期等待人工核验。'
        : '赛事由社区聚合页发现；日期、报名状态和官方入口均需人工核验。',
      judgementReasons: ['聚合来源仅用于发现，不作为自动发布依据'],
      suitableFor: [],
      notSuitableFor: [],
      tags: ['社区发现'],
      evidence: [{ field: 'sourceRecord', sourceUrl: record.url, quote }],
      confidence: {
        eventName: 'pending_verify',
        city: 'pending_verify',
        eventDate: dateConflict ? 'source_error' : 'pending_verify',
        distanceItems: 'pending_verify',
        officialUrl: 'pending_verify',
        signupStatus: 'pending_verify',
      },
    },
  };
}

export function normalizeAggregatorEventName(value: string) {
  return value
    .replace(/[（(][^）)]*(?:名额|套餐|报名)[^）)]*[）)]\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseChineseDate(text: string) {
  const match = text.match(/比赛日期\s*(20\d{2})年(\d{1,2})月(\d{1,2})日/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function inferDistanceItems(text: string) {
  const distances: string[] = [];
  if (/全程|42\.195|马拉松/.test(text) && !/仅?半程/.test(text)) distances.push('马拉松');
  if (/半程|21\.0975/.test(text)) distances.push('半程马拉松');
  if (/10\s*(?:公里|KM|K\b)/i.test(text)) distances.push('10公里');
  return [...new Set(distances)];
}

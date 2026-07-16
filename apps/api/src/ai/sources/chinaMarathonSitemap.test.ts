import { describe, expect, it, vi } from 'vitest';
import {
  fetchChinaMarathonSitemapCandidates,
  normalizeAggregatorEventName,
  parseChinaMarathonDetail,
  parseSitemap,
} from './chinaMarathonSitemap.js';

const sitemap = `<?xml version="1.0"?><urlset xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url><loc>https://chinamarathon.com/events/1</loc><lastmod>2026-07-16</lastmod><image:image><image:title>2026港珠澳大桥（香港段）半程马拉松（直通名额）</image:title></image:image></url>
  <url><loc>https://chinamarathon.com/events/2</loc><lastmod>2026-07-15</lastmod><image:image><image:title>2026港珠澳大桥（香港段）半程马拉松（一起环游名额套餐）</image:title></image:image></url>
  <url><loc>https://chinamarathon.com/events/3</loc><lastmod>2026-07-14</lastmod><image:image><image:title>北京测试马拉松</image:title></image:image></url>
</urlset>`;

describe('China Marathon sitemap adapter', () => {
  it('parses sitemap records and normalizes registration package suffixes', () => {
    expect(parseSitemap(sitemap)).toHaveLength(3);
    expect(normalizeAggregatorEventName('赛事（直通名额）')).toBe('赛事');
    expect(normalizeAggregatorEventName('赛事（一起环游名额套餐）')).toBe('赛事');
  });

  it('fetches detail pages sequentially and collapses package duplicates', async () => {
    const calls: string[] = [];
    const fetchPage = vi.fn(async (url: string) => {
      calls.push(url);
      return {
        url,
        title: '赛事详情',
        text: '比赛日期 2026年11月15日 比赛地点 香港特别行政区・中国香港・港珠澳大桥 赛事类型 跑步 半程马拉松',
      };
    });
    const result = await fetchChinaMarathonSitemapCandidates({
      fetchImpl: vi.fn().mockResolvedValue(new Response(sitemap, { status: 200 })),
      fetchPage,
      pageSize: 10,
    });

    expect(calls).toEqual([
      'https://chinamarathon.com/events/1',
      'https://chinamarathon.com/events/2',
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].candidate).toMatchObject({
      eventName: '2026港珠澳大桥（香港段）半程马拉松',
      city: '香港',
      eventDate: '2026-11-15',
      sourceLevel: 'community',
      officialUrl: null,
    });
  });

  it('keeps title/date conflicts for manual review with the date cleared', () => {
    const candidate = parseChinaMarathonDetail(
      '比赛日期 2016年11月15日 比赛地点 香港特别行政区・中国香港 赛事类型 跑步',
      {
        url: 'https://chinamarathon.com/events/1',
        externalId: '1',
        title: '2026香港半程马拉松',
        lastmod: null,
      },
    );
    expect(candidate).toMatchObject({
      reviewIssues: ['source_date_conflict'],
      candidate: { eventDate: null, city: '香港' },
    });
  });
});

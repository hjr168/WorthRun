import { describe, expect, it } from 'vitest';
import {
  CHINAATH_PUBLIC_LIST_URL,
  CHINAMARATHON_SITEMAP_URL,
  eventSourceSchema,
  WORLD_ATHLETICS_CALENDAR_URL,
} from './eventSourceConfig.js';

describe('eventSourceSchema', () => {
  it('normalizes a fixed China Athletics source', () => {
    const parsed = eventSourceSchema.parse({
      name: '中国田协官方赛事目录',
      sourceType: 'chinaath_api',
      entryUrl: 'https://attacker.example/ignored',
      allowedDomains: ['attacker.example'],
      cityHints: ['广州市'],
      status: 'active',
    });

    expect(parsed.entryUrl).toBe(CHINAATH_PUBLIC_LIST_URL);
    expect(parsed.allowedDomains).toEqual([
      'www.runchina.org.cn',
      'runchina.org.cn',
      'api-changzheng.chinaath.com',
    ]);
    expect(parsed.searchQuery).toBeNull();
    expect(parsed.cityHints).toEqual(['广州']);
    expect(parsed).toMatchObject({
      sourceLevel: 'official',
      scheduleEnabled: false,
      scheduleIntervalHours: 24,
      pageSize: 20,
      maxPagesPerRun: 1,
    });
  });

  it('requires an entry URL for a page source', () => {
    expect(() =>
      eventSourceSchema.parse({
        name: '空页面源',
        sourceType: 'page_url',
      }),
    ).toThrow('页面 URL 赛事源缺少入口 URL');
  });

  it('forces page sources to one bounded page', () => {
    const parsed = eventSourceSchema.parse({
      name: '赛事详情页',
      sourceType: 'page_url',
      entryUrl: 'https://official.example/race',
      pageSize: 20,
      maxPagesPerRun: 2,
    });

    expect(parsed).toMatchObject({ pageSize: 1, maxPagesPerRun: 1 });
  });

  it('rejects schedule and batch values outside the low-memory limits', () => {
    expect(() =>
      eventSourceSchema.parse({
        name: '过大批次',
        sourceType: 'chinaath_api',
        scheduleIntervalHours: 169,
        pageSize: 21,
        maxPagesPerRun: 3,
      }),
    ).toThrow();
  });

  it('rejects target cities outside the Greater Bay Area', () => {
    expect(() =>
      eventSourceSchema.parse({
        name: '全国来源',
        sourceType: 'chinaath_api',
        cityHints: ['北京'],
      }),
    ).toThrow('目标城市必须属于粤港澳大湾区');
  });

  it('requires exactly one mainland city for China Athletics', () => {
    expect(() =>
      eventSourceSchema.parse({
        name: '多城市来源',
        sourceType: 'chinaath_api',
        cityHints: ['广州', '深圳'],
      }),
    ).toThrow('必须且只能选择一个');
    expect(() =>
      eventSourceSchema.parse({
        name: '香港来源',
        sourceType: 'chinaath_api',
        cityHints: ['香港'],
      }),
    ).toThrow('大湾区内地城市');
  });

  it('locks fixed structured sources to server-owned URLs and limits', () => {
    const world = eventSourceSchema.parse({
      name: '世界田联',
      sourceType: 'world_athletics',
      entryUrl: 'https://attacker.example',
      cityHints: ['深圳'],
    });
    expect(world).toMatchObject({
      entryUrl: WORLD_ATHLETICS_CALENDAR_URL,
      cityHints: ['香港'],
      sourceLevel: 'official',
      maxPagesPerRun: 1,
    });

    const sitemap = eventSourceSchema.parse({
      name: '社区发现',
      sourceType: 'chinamarathon_sitemap',
      pageSize: 20,
      maxPagesPerRun: 2,
    });
    expect(sitemap).toMatchObject({
      entryUrl: CHINAMARATHON_SITEMAP_URL,
      sourceLevel: 'community',
      pageSize: 10,
      maxPagesPerRun: 1,
    });
  });
});

import { describe, expect, it } from 'vitest';
import { CHINAATH_PUBLIC_LIST_URL, eventSourceSchema } from './eventSourceConfig.js';

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
});

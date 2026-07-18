import { describe, expect, it } from 'vitest';
import { aiEventCandidateSchema, normalizeAiCandidate } from './eventCandidateSchema.js';

describe('aiEventCandidateSchema', () => {
  it('accepts a sourced event candidate', () => {
    const parsed = aiEventCandidateSchema.parse({
      eventName: '广州黄埔马拉松',
      city: '广州',
      eventDate: '2026-12-20',
      distanceItems: ['半马', '10K'],
      signupStatus: 'unknown',
      signupDeadline: null,
      officialUrl: 'https://www.example-race.org',
      sourceName: '赛事官网',
      sourceUrl: 'https://www.example-race.org/news/2026',
      sourceLevel: 'official',
      runJudgement: 'unverified',
      judgementSummary: '信息来自官方公告，仍需人工确认报名细节。',
      judgementReasons: ['来源为官方页面'],
      suitableFor: [],
      notSuitableFor: [],
      tags: ['待核验'],
      evidence: [
        {
          field: 'eventDate',
          sourceUrl: 'https://www.example-race.org/news/2026',
          quote: '比赛时间：2026年12月20日',
        },
      ],
      confidence: {
        eventName: 'verified',
        eventDate: 'pending_verify',
        officialUrl: 'pending_verify',
      },
    });

    expect(parsed.eventName).toBe('广州黄埔马拉松');
  });

  it('rejects candidates without evidence', () => {
    expect(() =>
      aiEventCandidateSchema.parse({
        eventName: '无证据赛事',
        city: '广州',
        eventDate: null,
        distanceItems: [],
        signupStatus: 'unknown',
        signupDeadline: null,
        officialUrl: null,
        sourceName: '未知',
        sourceUrl: null,
        sourceLevel: 'unknown',
        runJudgement: 'unverified',
        judgementSummary: '',
        judgementReasons: [],
        suitableFor: [],
        notSuitableFor: [],
        tags: [],
        evidence: [],
        confidence: {},
      }),
    ).toThrow();
  });

  it('normalizes missing URLs without inventing them', () => {
    const result = normalizeAiCandidate({
      eventName: '广州测试跑',
      city: '广州',
      eventDate: null,
      distanceItems: ['10K'],
      signupStatus: 'unknown',
      signupDeadline: null,
      officialUrl: '',
      sourceName: '公众号文章',
      sourceUrl: 'https://mp.weixin.qq.com/example',
      sourceLevel: 'secondary',
      runJudgement: 'unverified',
      judgementSummary: '',
      judgementReasons: [],
      suitableFor: [],
      notSuitableFor: [],
      tags: [],
      evidence: [
        {
          field: 'eventName',
          sourceUrl: 'https://mp.weixin.qq.com/example',
          quote: '广州测试跑',
        },
      ],
      confidence: {},
    });

    expect(result.officialUrl).toBeNull();
  });

  it('normalizes a date-only signup deadline to the end of the Beijing day', () => {
    const result = normalizeAiCandidate({
      eventName: '港珠澳大桥半马',
      city: '香港',
      eventDate: '2026-11-15',
      distanceItems: ['半程马拉松'],
      signupStatus: 'unknown',
      signupDeadline: '2026-08-24',
      officialUrl: null,
      sourceName: '赛事官网',
      sourceUrl: 'https://hzmb-halfmarathon.com/zh_cn/important-information',
      sourceLevel: 'official',
      runJudgement: 'unverified',
      judgementSummary: '',
      judgementReasons: [],
      suitableFor: [],
      notSuitableFor: [],
      tags: [],
      evidence: [
        {
          field: 'signupDeadline',
          sourceUrl: 'https://hzmb-halfmarathon.com/zh_cn/important-information',
          quote: '报名截止日期：2026年8月24日',
        },
      ],
      confidence: {},
    });

    expect(result.signupDeadline).toBe('2026-08-24T15:59:59.999Z');
  });
});

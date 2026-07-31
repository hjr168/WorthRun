import { describe, expect, it } from 'vitest';
import {
  buildRadarQuery,
  hasNoPreferences,
  radarGroupDisplay,
  radarGroupOrder,
  radarTotalCount,
  toDisplayGroups,
} from './radar';
import type { RadarResponse, RadarEventSummary } from './api';

const emptyResp: RadarResponse = {
  generatedAt: '2026-07-28T00:00:00.000Z',
  window: { start: '', end: '', days: 90 },
  filters: { cities: [], distances: [], focusTags: [] },
  campaign: null,
  total: 0,
  groups: { signupOpening: [], closingSoon: [], recentlyChanged: [], matched: [] },
  complianceNotice: 'AI 整理，仅供参考，报名以官方为准。',
  officialActionText: '前往官方确认',
};

const ev = (over: Partial<RadarEventSummary> = {}): RadarEventSummary => ({
  id: 'e1',
  eventName: '测试赛事',
  city: '广州',
  eventDate: '2026-09-15',
  distanceItems: ['半马'],
  signupStatus: 'closing_soon',
  officialUrl: 'https://example.com',
  sourceName: '官方',
  sourceLevel: 'official',
  infoStatus: 'verified',
  runJudgement: 'priority',
  primaryGroup: 'closingSoon',
  badges: [],
  matchScore: null,
  matchReasons: [],
  ...over,
});

describe('buildRadarQuery', () => {
  it('joins arrays as csv and omits empty dims', () => {
    expect(
      buildRadarQuery({ cities: ['广州', '深圳'], distances: ['半马'], focusTags: [] }),
    ).toEqual({ cities: '广州,深圳', distances: '半马' });
  });
  it('omits optional fields when absent', () => {
    expect(buildRadarQuery({ cities: [], distances: [], focusTags: [] })).toEqual({});
  });
  it('includes window/campaign/limit when provided', () => {
    expect(
      buildRadarQuery({
        cities: ['广州'],
        distances: [],
        focusTags: [],
        windowDays: 90,
        campaign: 'gz-01',
        limitPerGroup: 3,
      }),
    ).toEqual({ cities: '广州', windowDays: 90, campaign: 'gz-01', limitPerGroup: 3 });
  });
});

describe('hasNoPreferences', () => {
  it('true when all dims empty', () => {
    expect(hasNoPreferences({ cities: [], distances: [], focusTags: [] })).toBe(true);
  });
  it('false when any dim present', () => {
    expect(hasNoPreferences({ cities: ['广州'], distances: [], focusTags: [] })).toBe(false);
  });
});

describe('radarGroupDisplay / order', () => {
  it('has the four canonical groups', () => {
    expect(Object.keys(radarGroupDisplay).sort()).toEqual(
      ['closingSoon', 'matched', 'recentlyChanged', 'signupOpening'].sort(),
    );
  });
  it('order ranks closingSoon first, matched last', () => {
    expect(radarGroupOrder[0]).toBe('closingSoon');
    expect(radarGroupOrder[radarGroupOrder.length - 1]).toBe('matched');
  });
});

describe('toDisplayGroups', () => {
  it('filters empty groups and keeps order', () => {
    const resp: RadarResponse = {
      ...emptyResp,
      filters: { cities: ['广州'], distances: ['半马'], focusTags: [] },
      total: 2,
      groups: {
        closingSoon: [ev({ primaryGroup: 'closingSoon' })],
        signupOpening: [],
        recentlyChanged: [ev({ id: 'e2', primaryGroup: 'recentlyChanged' })],
        matched: [],
      },
    };
    const groups = toDisplayGroups(resp);
    expect(groups.map((g) => g.key)).toEqual(['closingSoon', 'recentlyChanged']);
    expect(groups[0].title).toBe('即将截止');
  });

  it('uses "近期值得关注" for matched group when no preferences', () => {
    const resp: RadarResponse = {
      ...emptyResp,
      filters: { cities: [], distances: [], focusTags: [] },
      total: 1,
      groups: {
        closingSoon: [],
        signupOpening: [],
        recentlyChanged: [],
        matched: [ev({ primaryGroup: 'matched' })],
      },
    };
    const groups = toDisplayGroups(resp);
    expect(groups[0].title).toBe('近期值得关注');
  });

  it('uses "更符合你的偏好" for matched when preferences exist', () => {
    const resp: RadarResponse = {
      ...emptyResp,
      filters: { cities: ['广州'], distances: [], focusTags: [] },
      total: 1,
      groups: {
        closingSoon: [],
        signupOpening: [],
        recentlyChanged: [],
        matched: [ev({ primaryGroup: 'matched' })],
      },
    };
    expect(toDisplayGroups(resp)[0].title).toBe('更符合你的偏好');
  });
});

describe('radarTotalCount', () => {
  it('returns response.total', () => {
    expect(radarTotalCount({ ...emptyResp, total: 5 })).toBe(5);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildBadges,
  computeMatchScore,
  decidePrimaryGroup,
  isClosingSoon,
  isRecentlyChanged,
  isSignupOpening,
  signupUrgency,
  type RadarEventInput,
} from './radarGroups.js';
import type { RadarFilters } from './radar.js';

const NOW = new Date('2026-08-01T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

const base = (over: Partial<RadarEventInput> = {}): RadarEventInput => ({
  id: 'e1',
  city: '广州',
  eventDate: '2026-09-15',
  distanceItems: ['半马'],
  signupStatus: 'not_started',
  signupStartAt: null,
  signupDeadline: null,
  runJudgement: 'unverified',
  infoStatus: 'pending_verify',
  sourceLevel: 'community',
  tags: [],
  hasRecentAppliedChange: false,
  ...over,
});

const noFilters: RadarFilters = { cities: [], distances: [], focusTags: [] };

describe('isSignupOpening', () => {
  it('true when signupStartAt within next 7 days', () => {
    expect(isSignupOpening(base({ signupStartAt: iso(NOW.getTime() + 3 * DAY) }), NOW)).toBe(true);
  });
  it('true when signup_open and started within past 7 days', () => {
    expect(
      isSignupOpening(
        base({ signupStatus: 'signup_open', signupStartAt: iso(NOW.getTime() - 3 * DAY) }),
        NOW,
      ),
    ).toBe(true);
  });
  it('false when not_started and start far future', () => {
    expect(isSignupOpening(base({ signupStartAt: iso(NOW.getTime() + 30 * DAY) }), NOW)).toBe(false);
  });
  it('false when no signupStartAt', () => {
    expect(isSignupOpening(base(), NOW)).toBe(false);
  });
});

describe('isClosingSoon', () => {
  it('true when signupStatus closing_soon', () => {
    expect(isClosingSoon(base({ signupStatus: 'closing_soon' }), NOW)).toBe(true);
  });
  it('true when signup_open and deadline within 7 days', () => {
    expect(
      isClosingSoon(
        base({ signupStatus: 'signup_open', signupDeadline: iso(NOW.getTime() + 5 * DAY) }),
        NOW,
      ),
    ).toBe(true);
  });
  it('false when signup_open and deadline far', () => {
    expect(
      isClosingSoon(
        base({ signupStatus: 'signup_open', signupDeadline: iso(NOW.getTime() + 30 * DAY) }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe('isRecentlyChanged', () => {
  it('reflects hasRecentAppliedChange flag', () => {
    expect(isRecentlyChanged(base({ hasRecentAppliedChange: true }))).toBe(true);
    expect(isRecentlyChanged(base({ hasRecentAppliedChange: false }))).toBe(false);
  });
});

describe('computeMatchScore', () => {
  it('returns 0 score and no reasons when no preferences (no fake personalization)', () => {
    const r = computeMatchScore(base(), noFilters, NOW);
    expect(r.score).toBe(0);
    expect(r.reasons).toEqual([]);
  });

  it('city hit +30, distance hit +25', () => {
    const r = computeMatchScore(
      base({ city: '广州', distanceItems: ['半马'] }),
      { cities: ['广州'], distances: ['半马'], focusTags: [] },
      NOW,
    );
    expect(r.score).toBe(55);
    expect(r.reasons).toEqual(expect.arrayContaining(['城市符合你的偏好（广州）', '半马 距离']));
  });

  it('focus tags cap at +30 (3+ hits)', () => {
    const r = computeMatchScore(
      base({ tags: ['新手友好', '交通方便', '风景路线', '适合 PB'] }),
      {
        cities: [],
        distances: [],
        focusTags: ['新手友好', '交通方便', '风景路线', '适合 PB'],
      },
      NOW,
    );
    expect(r.score).toBe(30); // capped
  });

  it('accumulates judgement + urgency + verified + trusted + near date', () => {
    const ev = base({
      city: '深圳',
      distanceItems: ['全马'],
      runJudgement: 'priority',
      infoStatus: 'verified',
      sourceLevel: 'official',
      signupStatus: 'closing_soon',
      eventDate: '2026-08-10', // within 30 days of NOW (2026-08-01)
    });
    const r = computeMatchScore(ev, { cities: ['深圳'], distances: ['全马'], focusTags: [] }, NOW);
    // city30 + dist25 + priority10 + closing5 + verified10 + official5 + nearDate5 = 90
    expect(r.score).toBe(90);
  });

  it('watch judgement adds +3, not +10', () => {
    const r = computeMatchScore(base({ runJudgement: 'watch' }), noFilters, NOW);
    expect(r.score).toBe(3);
  });

  it('does NOT output decision-making reasons like "推荐报名"', () => {
    const r = computeMatchScore(
      base({ city: '广州' }),
      { cities: ['广州'], distances: [], focusTags: [] },
      NOW,
    );
    expect(r.reasons.some((x) => /推荐|一定|值得跑|报名/.test(x))).toBe(false);
  });
});

describe('decidePrimaryGroup priority', () => {
  it('closingSoon beats signupOpening', () => {
    const ev = base({
      signupStatus: 'closing_soon',
      signupStartAt: iso(NOW.getTime() + 2 * DAY),
    });
    expect(decidePrimaryGroup(ev, noFilters, NOW)).toBe('closingSoon');
  });
  it('returns matched when only score-based', () => {
    const ev = base({ city: '广州' });
    expect(decidePrimaryGroup(ev, { cities: ['广州'], distances: [], focusTags: [] }, NOW)).toBe(
      'matched',
    );
  });
  it('returns null when nothing matches', () => {
    expect(decidePrimaryGroup(base(), noFilters, NOW)).toBeNull();
  });
  it('recentlyChanged when hasRecentAppliedChange and no higher group', () => {
    expect(decidePrimaryGroup(base({ hasRecentAppliedChange: true }), noFilters, NOW)).toBe(
      'recentlyChanged',
    );
  });
});

describe('buildBadges', () => {
  it('lists secondary hit reasons not in primary group', () => {
    const ev = base({
      signupStatus: 'closing_soon',
      infoStatus: 'verified',
      hasRecentAppliedChange: true,
    });
    const badges = buildBadges(ev, 'matched', NOW);
    expect(badges).toContain('即将截止');
    expect(badges).toContain('信息已核验');
    expect(badges).toContain('近期有确认更新');
  });
  it('does not repeat the primary group as a badge', () => {
    const ev = base({ signupStatus: 'closing_soon' });
    const badges = buildBadges(ev, 'closingSoon', NOW);
    expect(badges).not.toContain('即将截止');
  });
});

describe('signupUrgency', () => {
  it('ranks closing_soon highest', () => {
    expect(signupUrgency(base({ signupStatus: 'closing_soon' }), NOW)).toBe(4);
  });
  it('open with near deadline ranks 3', () => {
    expect(
      signupUrgency(
        base({ signupStatus: 'signup_open', signupDeadline: iso(NOW.getTime() + 5 * DAY) }),
        NOW,
      ),
    ).toBe(3);
  });
  it('not_started with no urgency is 0', () => {
    expect(signupUrgency(base({ signupStatus: 'not_started' }), NOW)).toBe(0);
  });
});

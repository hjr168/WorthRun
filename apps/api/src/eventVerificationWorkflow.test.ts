import { describe, expect, it } from 'vitest';
import {
  criticalEventFieldsChanged,
  eventVerificationIssues,
  reviewedReminderUpdate,
  verifiedFieldConfidence,
} from './eventVerificationWorkflow.js';

const now = new Date('2026-07-27T00:00:00.000Z');

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    eventName: '湾区马拉松',
    city: '广州',
    eventDate: new Date('2026-10-01T00:00:00.000Z'),
    eventStartAt: new Date('2026-10-01T23:30:00.000Z'),
    distanceItems: ['全马'],
    signupStatus: 'not_started',
    signupStartAt: new Date('2026-08-01T01:00:00.000Z'),
    signupDeadline: null,
    officialUrl: 'https://event.example.com',
    sourceName: '赛事官网',
    sourceUrl: 'https://event.example.com/notice',
    sourceLevel: 'official',
    publishStatus: 'published',
    infoStatus: 'ai_generated',
    fieldConfidence: {},
    updatedAt: new Date('2026-07-26T00:00:00.000Z'),
    sourceSummaries: [{ status: 'published', staleAt: null }],
    changeAlerts: [],
    ...overrides,
  };
}

describe('event verification workflow', () => {
  it('accepts a future official event with a current published summary', () => {
    expect(eventVerificationIssues(event(), now)).toEqual([]);
  });

  it('auto-fills nationwide region codes from the city name instead of blocking verification', () => {
    const previous = process.env.NATIONWIDE_DISCOVERY_ENABLED;
    process.env.NATIONWIDE_DISCOVERY_ENABLED = 'true';
    try {
      // 城市可识别但省市行政区代码缺失：校验自动用城市名兜底，不再报 missing_region_code，
      // 这样无代码编辑入口的核验页也能放行（实际代码补齐在落库时完成）。
      expect(eventVerificationIssues(event(), now)).not.toContain('missing_region_code');
      expect(
        eventVerificationIssues(event({ provinceCode: '440000', cityCode: '440100' }), now),
      ).not.toContain('missing_region_code');
      // 不在首期全国目录的城市仍需人工处理
      expect(
        eventVerificationIssues(event({ city: '西宁' }), now),
      ).toContain('unsupported_region');
      // 补齐 region 视为关键字段变化（核验失效）
      expect(
        criticalEventFieldsChanged(event(), {
          ...event(),
          provinceCode: '440000',
          cityCode: '440100',
        }),
      ).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.NATIONWIDE_DISCOVERY_ENABLED;
      else process.env.NATIONWIDE_DISCOVERY_ENABLED = previous;
    }
  });

  it('rejects missing or stale evidence and open change alerts', () => {
    expect(
      eventVerificationIssues(
        event({
          sourceSummaries: [{ status: 'published', staleAt: now }],
          changeAlerts: [{ id: 'alert-1' }],
        }),
        now,
      ),
    ).toEqual(expect.arrayContaining(['source_summary_stale', 'open_change_alert']));
  });

  it('marks only present, human-reviewed fields as verified', () => {
    expect(verifiedFieldConfidence(event({ signupDeadline: null }))).toMatchObject({
      eventName: 'verified',
      eventDate: 'verified',
      eventStartAt: 'verified',
      signupStartAt: 'verified',
    });
    expect(verifiedFieldConfidence(event({ signupDeadline: null }))).not.toHaveProperty(
      'signupDeadline',
    );
  });

  it('invalidates verification only when a critical field changes', () => {
    expect(
      criticalEventFieldsChanged(event(), {
        ...event(),
        judgementSummary: '更新判断文案',
      }),
    ).toBe(false);
    expect(
      criticalEventFieldsChanged(event(), {
        ...event(),
        officialUrl: 'https://event.example.com/new',
      }),
    ).toBe(true);
  });

  it('reactivates reviewed reminders only when fresh verification makes them eligible', () => {
    expect(reviewedReminderUpdate('signup', event(), now)).toMatchObject({
      status: 'pending',
      trigger: 'signup_open',
      scheduledAt: new Date('2026-08-01T01:00:00.000Z'),
    });
    expect(reviewedReminderUpdate('race_week', event({ eventStartAt: null }), now)).toBeNull();
  });
});

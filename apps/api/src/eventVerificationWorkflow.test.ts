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

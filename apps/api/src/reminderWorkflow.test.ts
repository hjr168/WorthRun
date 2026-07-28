import { describe, expect, it } from 'vitest';
import {
  buildReminderOptions,
  canReactivateReminder,
  reminderIssueCodes,
} from './reminderWorkflow.js';

const event = {
  id: 'event-1',
  eventDate: new Date('2026-12-21T00:00:00.000Z'),
  eventStartAt: new Date('2026-12-20T23:30:00.000Z'),
  signupStatus: 'not_started',
  signupStartAt: new Date('2026-08-01T02:00:00.000Z'),
  signupDeadline: null,
  publishStatus: 'published',
  infoStatus: 'verified',
  sourceLevel: 'official',
  changeAlerts: [],
};

describe('reminder options', () => {
  it('schedules signup opening and race week from verified precise times', () => {
    const options = buildReminderOptions(event, new Date('2026-07-22T00:00:00.000Z'));
    expect(options[0]).toMatchObject({
      available: true,
      trigger: 'signup_open',
      scheduledAt: event.signupStartAt,
    });
    expect(options[1].scheduledAt?.toISOString()).toBe('2026-12-14T01:00:00.000Z');
  });

  it('blocks unverified events', () => {
    expect(buildReminderOptions({ ...event, infoStatus: 'pending_verify' })[0]).toMatchObject({
      available: false,
      reason: '赛事信息尚未人工核实',
    });
  });

  it('uses the deadline reminder when signup is open', () => {
    const options = buildReminderOptions(
      {
        ...event,
        signupStatus: 'signup_open',
        signupDeadline: new Date('2026-08-10T12:00:00.000Z'),
      },
      new Date('2026-08-01T00:00:00.000Z'),
    );
    expect(options[0].scheduledAt?.toISOString()).toBe('2026-08-07T01:00:00.000Z');
  });

  it('requires precise signup and race start times', () => {
    const options = buildReminderOptions(
      { ...event, eventStartAt: null, signupStartAt: null },
      new Date('2026-07-22T00:00:00.000Z'),
    );
    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'signup', available: false }),
        expect.objectContaining({ type: 'race_week', available: false }),
      ]),
    );
  });

  it('returns stable operation issue codes for missing verified times', () => {
    expect(
      reminderIssueCodes({
        ...event,
        signupStatus: 'signup_open',
        signupStartAt: null,
        signupDeadline: null,
        eventStartAt: null,
      }),
    ).toEqual(['missing_signup_deadline', 'missing_event_start_at']);
  });

  it('never reactivates a reminder that was already sent', () => {
    expect(canReactivateReminder('sent')).toBe(false);
    expect(canReactivateReminder('cancelled')).toBe(true);
    expect(canReactivateReminder('failed')).toBe(true);
  });
});

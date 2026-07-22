import { describe, expect, it } from 'vitest';
import { buildReminderOptions, canReactivateReminder } from './reminderWorkflow.js';

const event = {
  id: 'event-1',
  eventDate: new Date('2026-12-20T00:00:00.000Z'),
  signupStatus: 'not_started',
  signupDeadline: null,
  publishStatus: 'published',
  infoStatus: 'verified',
  sourceLevel: 'official',
  changeAlerts: [],
};

describe('reminder options', () => {
  it('waits for signup opening and schedules race week at Beijing 09:00', () => {
    const options = buildReminderOptions(event, new Date('2026-07-22T00:00:00.000Z'));
    expect(options[0]).toMatchObject({
      available: true,
      trigger: 'signup_open',
      scheduledAt: null,
    });
    expect(options[1].scheduledAt?.toISOString()).toBe('2026-12-13T01:00:00.000Z');
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

  it('never reactivates a reminder that was already sent', () => {
    expect(canReactivateReminder('sent')).toBe(false);
    expect(canReactivateReminder('cancelled')).toBe(true);
    expect(canReactivateReminder('failed')).toBe(true);
  });
});

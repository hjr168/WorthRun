import { describe, expect, it } from 'vitest';
import { reminderMessageDate } from './reminderDelivery.js';

describe('reminder message date', () => {
  const now = new Date('2026-07-22T02:30:00.000Z');
  const eventDate = new Date('2026-11-08T00:00:00.000Z');
  const signupDeadline = new Date('2026-09-01T04:00:00.000Z');

  it('uses the detection time when registration has just opened', () => {
    expect(
      reminderMessageDate({
        reminderType: 'signup',
        trigger: 'signup_open',
        signupDeadline,
        eventDate,
        now,
      }),
    ).toBe(now);
  });

  it('uses the verified deadline for deadline reminders', () => {
    expect(
      reminderMessageDate({
        reminderType: 'signup',
        trigger: 'signup_deadline_3d',
        signupDeadline,
        eventDate,
        now,
      }),
    ).toBe(signupDeadline);
  });

  it('uses the event date for race week reminders', () => {
    expect(
      reminderMessageDate({
        reminderType: 'race_week',
        trigger: 'race_week_7d',
        signupDeadline,
        eventDate,
        now,
      }),
    ).toBe(eventDate);
  });
});

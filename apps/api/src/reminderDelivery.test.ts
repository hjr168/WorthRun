import { describe, expect, it } from 'vitest';
import {
  assertReminderDeliveryEnabled,
  assertTrialReminderDelivery,
  formatChinaTime,
  reminderDeliveryError,
  reminderMessageDate,
} from './reminderDelivery.js';

describe('reminder delivery feature flag', () => {
  it('blocks apply delivery unless the reminder feature is explicitly enabled', () => {
    expect(() => assertReminderDeliveryEnabled({})).toThrow('赛事提醒功能未开启');
    expect(() => assertReminderDeliveryEnabled({ REMINDER_FEATURE_ENABLED: 'false' })).toThrow(
      '赛事提醒功能未开启',
    );
    expect(() => assertReminderDeliveryEnabled({ REMINDER_FEATURE_ENABLED: 'true' })).not.toThrow();
  });

  it('allows test sends only for the trial mini program', () => {
    expect(() => assertTrialReminderDelivery({ WX_MINIPROGRAM_STATE: 'formal' })).toThrow(
      '测试发送只允许',
    );
    expect(() => assertTrialReminderDelivery({ WX_MINIPROGRAM_STATE: 'trial' })).not.toThrow();
  });
});

describe('reminder message date', () => {
  const eventStartAt = new Date('2026-11-07T23:30:00.000Z');
  const signupStartAt = new Date('2026-08-01T02:00:00.000Z');
  const signupDeadline = new Date('2026-09-01T04:00:00.000Z');

  it('uses the verified signup start time when registration opens', () => {
    expect(
      reminderMessageDate({
        reminderType: 'signup',
        trigger: 'signup_open',
        signupStartAt,
        signupDeadline,
        eventStartAt,
      }),
    ).toBe(signupStartAt);
  });

  it('uses the verified deadline for deadline reminders', () => {
    expect(
      reminderMessageDate({
        reminderType: 'signup',
        trigger: 'signup_deadline_3d',
        signupStartAt,
        signupDeadline,
        eventStartAt,
      }),
    ).toBe(signupDeadline);
  });

  it('uses the verified event start time for race week reminders', () => {
    expect(
      reminderMessageDate({
        reminderType: 'race_week',
        trigger: 'race_week_7d',
        signupStartAt,
        signupDeadline,
        eventStartAt,
      }),
    ).toBe(eventStartAt);
  });
});

describe('reminder payload safety', () => {
  it('formats template time in Beijing time', () => {
    expect(formatChinaTime(new Date('2026-10-03T23:30:00.000Z'))).toBe('2026-10-04 07:30');
  });

  it('retries only transient delivery errors', () => {
    expect(reminderDeliveryError(new Error('wechat_send_-1')).retryable).toBe(true);
    expect(reminderDeliveryError(new Error('wechat_send_500')).retryable).toBe(true);
    expect(reminderDeliveryError(new Error('fetch failed')).retryable).toBe(true);
    expect(reminderDeliveryError(new Error('wechat_send_42001')).retryable).toBe(false);
    expect(reminderDeliveryError(new Error('wechat_send_43101')).retryable).toBe(false);
  });
});

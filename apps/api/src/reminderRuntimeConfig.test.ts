import { describe, expect, it } from 'vitest';
import {
  cloudDaysRemaining,
  readRuntimeEnvFile,
  reminderRuntimeConfigMatched,
} from './reminderRuntimeConfig.js';

const configured = {
  REMINDER_FEATURE_ENABLED: 'false',
  WX_MINIPROGRAM_STATE: 'trial',
  WX_SIGNUP_REMINDER_TEMPLATE_ID: 'signup-template',
  WX_SIGNUP_REMINDER_EVENT_FIELD: 'thing9',
  WX_SIGNUP_REMINDER_DATE_FIELD: 'time2',
  WX_SIGNUP_REMINDER_NOTICE_FIELD: 'thing3',
  WX_RACE_REMINDER_TEMPLATE_ID: 'race-template',
  WX_RACE_REMINDER_EVENT_FIELD: 'thing1',
  WX_RACE_REMINDER_DATE_FIELD: 'time11',
  WX_RACE_REMINDER_NOTICE_FIELD: 'thing5',
  UNICLOUD_SPACE_EXPIRES_AT: '2026-12-31T23:59:59+08:00',
};

describe('reminder runtime config', () => {
  it('detects a stale inherited reminder value without exposing the value', () => {
    expect(reminderRuntimeConfigMatched(configured, configured)).toBe(true);
    expect(
      reminderRuntimeConfigMatched(
        { ...configured, WX_RACE_REMINDER_TEMPLATE_ID: 'stale-template' },
        configured,
      ),
    ).toBe(false);
  });

  it('treats a missing env file as a mismatch', () => {
    expect(readRuntimeEnvFile('/path/that/does/not/exist')).toBeNull();
    expect(reminderRuntimeConfigMatched(configured, null)).toBe(false);
  });

  it('returns whole remaining days and null for an invalid expiry', () => {
    expect(
      cloudDaysRemaining('2026-08-30T00:00:00.000Z', new Date('2026-07-28T00:00:00.000Z')),
    ).toBe(33);
    expect(cloudDaysRemaining('invalid')).toBeNull();
  });
});

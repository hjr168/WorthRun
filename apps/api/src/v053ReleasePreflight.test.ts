import { describe, expect, it } from 'vitest';
import { evaluateV053Environment } from './v053ReleasePreflight.js';

const readyEnv = {
  NODE_ENV: 'production',
  APP_RELEASE: 'v0.5.3',
  USER_SYSTEM_ENABLED: 'true',
  REMINDER_FEATURE_ENABLED: 'true',
  WX_APPID: 'wx-app-id',
  WX_APPSECRET: 'x'.repeat(32),
  USER_TOKEN_SECRET: 't'.repeat(48),
  USER_OPENID_HASH_SECRET: 'h'.repeat(48),
  USER_OPENID_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  UNICLOUD_AVATAR_BASE_URL: 'https://env-example123.dev-hz.cloudbasefunction.cn/worthrun-avatar',
  UNICLOUD_AVATAR_SHARED_SECRET: 'a'.repeat(48),
  UNICLOUD_PROVIDER: 'alipay',
  UNICLOUD_SPACE_ID: 'env-example123',
  UNICLOUD_SPACE_EXPIRES_AT: '2099-12-31T23:59:59+08:00',
  WX_SIGNUP_REMINDER_TEMPLATE_ID: 'signup-template',
  WX_RACE_REMINDER_TEMPLATE_ID: 'race-template',
  WX_SIGNUP_REMINDER_EVENT_FIELD: 'thing9',
  WX_SIGNUP_REMINDER_NOTICE_FIELD: 'thing3',
  WX_SIGNUP_REMINDER_DATE_FIELD: 'time2',
  WX_RACE_REMINDER_EVENT_FIELD: 'thing1',
  WX_RACE_REMINDER_NOTICE_FIELD: 'thing5',
  WX_RACE_REMINDER_DATE_FIELD: 'time11',
};

describe('V0.5.3 release preflight', () => {
  it('passes a complete reminder rollout environment', () => {
    expect(evaluateV053Environment(readyEnv, 'reminders')).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'pass' })]),
    );
    expect(evaluateV053Environment(readyEnv, 'reminders')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'blocker' })]),
    );
  });

  it('blocks reused secrets and missing external services', () => {
    const checks = evaluateV053Environment(
      {
        ...readyEnv,
        USER_OPENID_HASH_SECRET: readyEnv.USER_TOKEN_SECRET,
        UNICLOUD_AVATAR_BASE_URL: '',
      },
      'users',
    );
    expect(checks.find((item) => item.id === 'separate_user_secrets')?.status).toBe('blocker');
    expect(checks.find((item) => item.id === 'avatar_url')?.status).toBe('blocker');
  });

  it('allows the foundation phase before external features are enabled', () => {
    const checks = evaluateV053Environment(
      { NODE_ENV: 'production', APP_RELEASE: 'v0.5.3' },
      'foundation',
    );
    expect(checks.every((item) => item.status === 'pass')).toBe(true);
  });

  it('blocks missing or invalid reminder template field keys', () => {
    const checks = evaluateV053Environment(
      { ...readyEnv, WX_RACE_REMINDER_DATE_FIELD: '比赛日期' },
      'reminders',
    );
    expect(checks.find((item) => item.id === 'race_template_fields')?.status).toBe('blocker');
  });
});

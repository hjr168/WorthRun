import { describe, expect, it } from 'vitest';
import {
  evaluateV053Environment,
  evaluateReminderRuntimeConfig,
  evaluateV053WechatTemplates,
} from './v053ReleasePreflight.js';

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
  WX_MINIPROGRAM_STATE: 'formal',
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

  it('allows configured reminders to remain disabled during trial readiness checks', () => {
    const checks = evaluateV053Environment(
      {
        ...readyEnv,
        REMINDER_FEATURE_ENABLED: 'false',
        WX_MINIPROGRAM_STATE: 'trial',
      },
      'reminders',
      'ready',
    );
    expect(checks.find((item) => item.id === 'reminder_feature')?.status).toBe('pass');
    expect(checks.find((item) => item.id === 'miniprogram_state')?.status).toBe('pass');
  });

  it('blocks a stale runtime reminder configuration', () => {
    const checks = evaluateReminderRuntimeConfig(
      { ...readyEnv, WX_RACE_REMINDER_TEMPLATE_ID: 'stale-template' },
      readyEnv,
    );
    expect(checks.find((item) => item.id === 'runtime_config_match')?.status).toBe('blocker');
  });

  it('only warns when the auto-renewed UniCloud date is near', () => {
    const checks = evaluateV053Environment(
      { ...readyEnv, UNICLOUD_SPACE_EXPIRES_AT: '2026-08-01T00:00:00+08:00' },
      'reminders',
    );
    expect(checks.find((item) => item.id === 'unicloud_expiry')?.status).toBe('warning');
    expect(checks.find((item) => item.id === 'unicloud_expiry')?.status).not.toBe('blocker');
  });

  it('blocks reminder template ids that do not exist in the current mini program', () => {
    const checks = evaluateV053WechatTemplates(readyEnv, [
      {
        priTmplId: 'signup-template',
        content: '{{thing9.DATA}} {{time2.DATA}} {{thing3.DATA}}',
      },
    ]);
    expect(checks.find((item) => item.id === 'wechat_signup_template')?.status).toBe('pass');
    expect(checks.find((item) => item.id === 'wechat_race_template')?.status).toBe('blocker');
  });

  it('checks the fields exposed by both WeChat templates', () => {
    const checks = evaluateV053WechatTemplates(readyEnv, [
      {
        priTmplId: 'signup-template',
        content: '{{thing9.DATA}} {{time2.DATA}} {{thing3.DATA}}',
      },
      {
        priTmplId: 'race-template',
        content: '{{thing1.DATA}} {{time11.DATA}} {{thing5.DATA}}',
      },
    ]);
    expect(checks.every((item) => item.status === 'pass')).toBe(true);
  });
});

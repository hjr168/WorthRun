import { describe, expect, it } from 'vitest';
import {
  classifyFeedbackRisk,
  createFeedbackFingerprint,
  getRetryAfterSeconds,
  getWindowStart,
  isLowInformationFeedback,
  normalizeFeedbackContent,
} from './feedbackAbuse.js';

describe('feedback abuse helpers', () => {
  it('normalizes whitespace before calculating a fingerprint', () => {
    expect(normalizeFeedbackContent('  报名\n截止时间   有误  ')).toBe('报名 截止时间 有误');
    expect(
      createFeedbackFingerprint('secret', {
        eventId: 'event-1',
        feedbackType: '日期有误',
        content: '报名\n截止时间 有误',
      }),
    ).toBe(
      createFeedbackFingerprint('secret', {
        eventId: 'event-1',
        feedbackType: '日期有误',
        content: ' 报名 截止时间   有误 ',
      }),
    );
  });

  it('keeps fingerprints isolated by event and feedback type', () => {
    const base = { feedbackType: '日期有误', content: '日期需要核对' };
    expect(createFeedbackFingerprint('secret', { ...base, eventId: 'event-1' })).not.toBe(
      createFeedbackFingerprint('secret', { ...base, eventId: 'event-2' }),
    );
  });

  it.each([
    ['${jndi:ldap://example.test/a}', 'jndi_probe'],
    ["1' UNION SELECT NULL--", 'sql_probe'],
    ['1 AND SLEEP(5)', 'sql_probe'],
    ['<script>alert(1)</script>', 'script_probe'],
    ['../../../../etc/passwd', 'path_probe'],
    ['正常内容\u0000尾部', 'control_character'],
  ])('classifies probe payload %s', (content, reason) => {
    expect(classifyFeedbackRisk(content)).toEqual({ suspicious: true, reason });
  });

  it.each([
    '比赛日期应为 2026-11-08',
    '官网链接 https://example.com 已失效',
    '报名页面显示名额已满，请核对。',
    '赛事延期，主办方公众号已发布通知',
    '页面使用 select 作为选项名称',
    '脚本 script 的说明文字',
  ])('keeps normal feedback safe: %s', (content) => {
    expect(classifyFeedbackRisk(content)).toEqual({ suspicious: false });
  });

  it('identifies low-information feedback', () => {
    expect(isLowInformationFeedback('日期有误', '日期有误')).toBe(true);
    expect(isLowInformationFeedback('其他', '太短')).toBe(true);
    expect(isLowInformationFeedback('日期有误', '正确日期应为 2026-11-08')).toBe(false);
  });

  it('calculates deterministic windows and retry time', () => {
    const now = new Date('2026-07-13T10:09:30.000Z');
    expect(getWindowStart(now, 10 * 60 * 1000).toISOString()).toBe('2026-07-13T10:00:00.000Z');
    expect(getRetryAfterSeconds(now, 10 * 60 * 1000)).toBe(30);
  });
});

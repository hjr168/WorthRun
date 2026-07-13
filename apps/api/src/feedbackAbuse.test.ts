import { describe, expect, it } from 'vitest';
import {
  createFeedbackFingerprint,
  getRetryAfterSeconds,
  getWindowStart,
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

  it('calculates deterministic windows and retry time', () => {
    const now = new Date('2026-07-13T10:09:30.000Z');
    expect(getWindowStart(now, 10 * 60 * 1000).toISOString()).toBe('2026-07-13T10:00:00.000Z');
    expect(getRetryAfterSeconds(now, 10 * 60 * 1000)).toBe(30);
  });
});

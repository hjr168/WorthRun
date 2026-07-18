import { describe, expect, it } from 'vitest';
import { publicFeedbackSchema } from './feedbackSubmission.js';

const base = {
  userKey: 'anonymous-user',
  requestId: 'feedback_request_123456',
  content: '这里需要补充足够具体的问题说明',
};

describe('public feedback submission', () => {
  it('keeps legacy event correction requests compatible', () => {
    const result = publicFeedbackSchema.parse({
      ...base,
      eventId: 'event-1',
      feedbackType: '日期有误',
    });
    expect(result.scope).toBe('event_correction');
  });

  it('accepts product feedback with minimal context', () => {
    expect(
      publicFeedbackSchema.parse({
        ...base,
        scope: 'product_feedback',
        feedbackType: '页面异常',
        contextPage: 'source_summary',
        appVersion: '1.2.3',
        relatedRequestId: '550e8400-e29b-41d4-a716-446655440000',
      }),
    ).toMatchObject({ scope: 'product_feedback', contextPage: 'source_summary' });
  });

  it('requires events only for event corrections', () => {
    expect(() =>
      publicFeedbackSchema.parse({
        ...base,
        feedbackType: '日期有误',
      }),
    ).toThrow();
    expect(() =>
      publicFeedbackSchema.parse({
        ...base,
        scope: 'product_feedback',
        eventId: 'event-1',
        feedbackType: '使用问题',
      }),
    ).toThrow();
  });

  it('rejects cross-scope categories and arbitrary context', () => {
    expect(() =>
      publicFeedbackSchema.parse({
        ...base,
        scope: 'product_feedback',
        feedbackType: '日期有误',
      }),
    ).toThrow();
    expect(() =>
      publicFeedbackSchema.parse({
        ...base,
        scope: 'product_feedback',
        feedbackType: '功能建议',
        contextPage: 'https://example.test/private',
      }),
    ).toThrow();
  });
});

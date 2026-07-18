import { describe, expect, it } from 'vitest';
import { buildFeedbackSummary, feedbackDisposition } from './feedbackWorkflow.js';

const now = new Date('2026-07-16T10:00:00.000Z');
const base = {
  eventId: 'event-1',
  userKey: 'user-1',
  feedbackType: '日期有误',
  status: 'pending',
  updatedAt: now,
  createdAt: now,
  event: {
    id: 'event-1',
    eventName: '广州测试赛',
    city: '广州',
    eventDate: new Date('2026-08-01'),
    publishStatus: 'published',
  },
};

describe('feedback workflow', () => {
  it('classifies public, stale, low-information and suspicious feedback', () => {
    expect(feedbackDisposition({ ...base, id: 'safe', content: '比赛日期应为八月二日' }, now)).toEqual({
      invalidType: false,
      feedbackScope: 'event_correction',
      riskReason: null,
      lowInformation: false,
      eventScope: 'public',
    });
    expect(
      feedbackDisposition(
        { ...base, id: 'stale', content: '比赛日期应为八月二日', event: null },
        now,
      ).eventScope,
    ).toBe('unpublished');
    expect(feedbackDisposition({ ...base, id: 'low', content: '日期有误' }, now).lowInformation).toBe(
      true,
    );
    expect(
      feedbackDisposition({ ...base, id: 'probe', content: '1 AND SLEEP(5)' }, now).riskReason,
    ).toBe('sql_probe');
    expect(
      feedbackDisposition(
        {
          ...base,
          id: 'invalid',
          feedbackType: '${jndi:ldap://example.test/a}',
          content: '日期需要核对',
        },
        now,
      ).invalidType,
    ).toBe(true);
  });

  it('treats product feedback as actionable without an event', () => {
    expect(
      feedbackDisposition(
        {
          ...base,
          id: 'product',
          scope: 'product_feedback',
          eventId: null,
          feedbackType: '功能建议',
          content: '希望增加更清晰的页面提示',
          event: null,
        },
        now,
      ),
    ).toMatchObject({
      invalidType: false,
      feedbackScope: 'product_feedback',
      eventScope: 'not_applicable',
    });
  });

  it('builds mutually exclusive queue counts and exact duplicate counts', () => {
    const items = [
      { ...base, id: 'safe', content: '比赛日期应为八月二日' },
      { ...base, id: 'duplicate', content: '比赛日期应为八月二日' },
      { ...base, id: 'low', userKey: 'user-2', content: '日期有误' },
      { ...base, id: 'probe', userKey: 'user-3', content: '${jndi:ldap://example.test/a}' },
      { ...base, id: 'stale', userKey: 'user-4', content: '官网链接打开后显示不存在', event: null },
    ];
    expect(buildFeedbackSummary(items, 8, 20, now)).toMatchObject({
      pending: 5,
      actionable: 1,
      suspicious: 1,
      lowInformation: 1,
      unpublishedEvent: 1,
      exactDuplicates: 1,
      blocked7d: 8,
      blocked30d: 20,
    });
  });
});

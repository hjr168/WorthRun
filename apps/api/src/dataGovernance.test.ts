import { describe, expect, it } from 'vitest';
import {
  assertExpectedCleanupCounts,
  buildDataCleanupPlan,
  DataCleanupConflictError,
} from './dataGovernance.js';

describe('buildDataCleanupPlan', () => {
  const now = new Date('2026-07-13T16:30:00.000Z');

  it('builds disjoint candidate and event cleanup actions', () => {
    const plan = buildDataCleanupPlan(
      {
        candidates: [
          { id: 'expired', eventName: '过期赛事', city: '北京', eventDate: new Date('2026-07-14') },
          {
            id: 'outside',
            eventName: '区域外赛事',
            city: '北京',
            eventDate: new Date('2026-07-15'),
          },
          { id: 'keep', eventName: '湾区赛事', city: '广州市', eventDate: new Date('2026-07-15') },
        ],
        events: [
          { id: 'old-event', eventName: '旧赛事', city: '广州', eventDate: new Date('2026-07-14') },
          {
            id: 'far-event',
            eventName: '外地赛事',
            city: '上海',
            eventDate: new Date('2026-07-15'),
          },
        ],
        feedback: [],
      },
      now,
    );

    expect(plan.ids.reject_expired_candidates).toEqual(['expired']);
    expect(plan.ids.reject_outside_region_candidates).toEqual(['outside']);
    expect(plan.ids.archive_expired_events).toEqual(['old-event']);
    expect(plan.ids.archive_outside_region_events).toEqual(['far-event']);
  });

  it('rejects invalid feedback and keeps only the earliest exact duplicate', () => {
    const plan = buildDataCleanupPlan(
      {
        candidates: [],
        events: [],
        feedback: [
          {
            id: 'invalid',
            eventId: 'e1',
            userKey: 'u1',
            feedbackType: 'SQL',
            content: 'x',
            createdAt: new Date('2026-07-01'),
          },
          {
            id: 'first',
            eventId: 'e1',
            userKey: 'u1',
            feedbackType: '日期有误',
            content: ' 比赛日期需要核对 ',
            createdAt: new Date('2026-07-01'),
            eventPublishStatus: 'published',
            eventCity: '广州',
            eventDate: new Date('2026-07-20'),
          },
          {
            id: 'duplicate',
            eventId: 'e1',
            userKey: 'u1',
            feedbackType: '日期有误',
            content: '比赛日期需要核对',
            createdAt: new Date('2026-07-02'),
            eventPublishStatus: 'published',
            eventCity: '广州',
            eventDate: new Date('2026-07-20'),
          },
          {
            id: 'other-user',
            eventId: 'e1',
            userKey: 'u2',
            feedbackType: '日期有误',
            content: '比赛日期需要核对',
            createdAt: new Date('2026-07-02'),
            eventPublishStatus: 'published',
            eventCity: '广州',
            eventDate: new Date('2026-07-20'),
          },
        ],
      },
      now,
    );

    expect(plan.ids.reject_invalid_feedback).toEqual(['invalid']);
    expect(plan.ids.reject_duplicate_feedback).toEqual(['duplicate']);
  });

  it('classifies feedback into mutually exclusive governance actions', () => {
    const plan = buildDataCleanupPlan(
      {
        candidates: [],
        events: [],
        feedback: [
          {
            id: 'probe',
            eventId: 'e1',
            userKey: 'u1',
            feedbackType: '其他',
            content: '${jndi:ldap://example.test/a}',
            createdAt: new Date('2026-07-01'),
            eventPublishStatus: 'archived',
            eventCity: '广州',
            eventDate: new Date('2026-07-20'),
          },
          {
            id: 'low-info',
            eventId: 'e1',
            userKey: 'u2',
            feedbackType: '日期有误',
            content: '日期有误',
            createdAt: new Date('2026-07-01'),
            eventPublishStatus: 'published',
            eventCity: '广州',
            eventDate: new Date('2026-07-20'),
          },
          {
            id: 'unpublished',
            eventId: 'e2',
            userKey: 'u3',
            feedbackType: '官方链接失效',
            content: '官网链接打开后显示页面不存在',
            createdAt: new Date('2026-07-01'),
            eventPublishStatus: 'archived',
            eventCity: '广州',
            eventDate: new Date('2026-07-20'),
          },
          {
            id: 'keep',
            eventId: 'e3',
            userKey: 'u4',
            feedbackType: '报名状态有误',
            content: '官网目前显示报名已经结束',
            createdAt: new Date('2026-07-01'),
            eventPublishStatus: 'published',
            eventCity: '深圳',
            eventDate: new Date('2026-07-20'),
          },
          {
            id: 'product',
            eventId: null,
            userKey: 'u5',
            scope: 'product_feedback',
            feedbackType: '功能建议',
            content: '希望增加更清晰的页面提示',
            createdAt: new Date('2026-07-01'),
          },
        ],
      },
      now,
    );

    expect(plan.ids.reject_suspicious_feedback).toEqual(['probe']);
    expect(plan.ids.reject_low_information_feedback).toEqual(['low-info']);
    expect(plan.ids.reject_unpublished_event_feedback).toEqual(['unpublished']);
    expect(Object.values(plan.ids).flat()).not.toContain('product');
    expect(plan.ids.reject_duplicate_feedback).toEqual([]);
    expect(Object.values(plan.ids).flat().filter((id) => id === 'probe')).toHaveLength(1);
    expect(plan.samples.reject_suspicious_feedback[0]).not.toContain('example.test');
  });

  it('aborts apply when any preview count has changed', () => {
    const counts = {
      reject_expired_candidates: 2,
      reject_outside_region_candidates: 0,
      archive_expired_events: 0,
      archive_outside_region_events: 0,
      reject_invalid_feedback: 0,
      reject_suspicious_feedback: 0,
      reject_low_information_feedback: 0,
      reject_unpublished_event_feedback: 0,
      reject_duplicate_feedback: 0,
    };

    expect(() =>
      assertExpectedCleanupCounts(
        ['reject_expired_candidates'],
        { reject_expired_candidates: 1 },
        counts,
      ),
    ).toThrow(DataCleanupConflictError);
    expect(() =>
      assertExpectedCleanupCounts(
        ['reject_expired_candidates'],
        { reject_expired_candidates: 2 },
        counts,
      ),
    ).not.toThrow();
  });
});

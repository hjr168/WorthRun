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
            content: ' 日期 错了 ',
            createdAt: new Date('2026-07-01'),
          },
          {
            id: 'duplicate',
            eventId: 'e1',
            userKey: 'u1',
            feedbackType: '日期有误',
            content: '日期 错了',
            createdAt: new Date('2026-07-02'),
          },
          {
            id: 'other-user',
            eventId: 'e1',
            userKey: 'u2',
            feedbackType: '日期有误',
            content: '日期 错了',
            createdAt: new Date('2026-07-02'),
          },
        ],
      },
      now,
    );

    expect(plan.ids.reject_invalid_feedback).toEqual(['invalid']);
    expect(plan.ids.reject_duplicate_feedback).toEqual(['duplicate']);
  });

  it('aborts apply when any preview count has changed', () => {
    const counts = {
      reject_expired_candidates: 2,
      reject_outside_region_candidates: 0,
      archive_expired_events: 0,
      archive_outside_region_events: 0,
      reject_invalid_feedback: 0,
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

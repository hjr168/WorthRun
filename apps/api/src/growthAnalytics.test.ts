import { describe, expect, it } from 'vitest';
import { activityDate, retentionRate } from './growthAnalytics.js';

describe('growth analytics', () => {
  it('uses the Beijing calendar day', () => {
    expect(activityDate(new Date('2026-07-22T16:30:00.000Z')).toISOString()).toBe(
      '2026-07-23T00:00:00.000Z',
    );
  });

  it('excludes incomplete retention cohorts', () => {
    const now = new Date('2026-07-10T04:00:00.000Z');
    const result = retentionRate({
      users: [
        { id: 'u1', registeredAt: new Date('2026-07-08T01:00:00.000Z') },
        { id: 'u2', registeredAt: new Date('2026-07-10T01:00:00.000Z') },
      ],
      activeDays: [{ userId: 'u1', activityDate: new Date('2026-07-09T00:00:00.000Z') }],
      offsetDays: 1,
      now,
    });
    expect(result).toEqual({ eligible: 1, returned: 1, rate: 100 });
  });
});

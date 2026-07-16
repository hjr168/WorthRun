import { describe, expect, it } from 'vitest';
import { boundedSelection, buildFeedbackQuery, feedbackSnapshots } from './feedback';

describe('feedback admin helpers', () => {
  it('builds an encoded server-side query', () => {
    expect(
      buildFeedbackQuery({
        page: 2,
        pageSize: 20,
        status: 'pending',
        feedbackType: '日期有误',
        eventScope: 'public',
        search: ' 广州 半马 ',
      }),
    ).toBe(
      'page=2&pageSize=20&status=pending&feedbackType=%E6%97%A5%E6%9C%9F%E6%9C%89%E8%AF%AF&eventScope=public&search=%E5%B9%BF%E5%B7%9E+%E5%8D%8A%E9%A9%AC',
    );
  });

  it('limits selection and creates preview snapshots', () => {
    expect(boundedSelection(Array.from({ length: 51 }, (_, index) => index)).accepted).toBe(false);
    expect(
      feedbackSnapshots(
        [
          { id: 'a', updatedAt: '2026-07-16T00:00:00.000Z' },
          { id: 'b', updatedAt: '2026-07-16T01:00:00.000Z' },
        ] as never,
        ['b'],
      ),
    ).toEqual([{ id: 'b', updatedAt: '2026-07-16T01:00:00.000Z' }]);
  });
});

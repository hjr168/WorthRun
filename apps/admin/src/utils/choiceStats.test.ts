import { describe, expect, it } from 'vitest';
import { buildEventChoiceStatsQuery } from './choiceStats.js';

describe('choice stats query', () => {
  it('serializes pagination, filters and sorting', () => {
    const params = new URLSearchParams(
      buildEventChoiceStatsQuery({
        page: 2,
        pageSize: 50,
        search: ' 广州 ',
        publishStatus: 'archived',
        eventDateFrom: '2025-01-01',
        eventDateTo: '2026-12-31',
        sort: 'recent_choice_desc',
      }),
    );
    expect(Object.fromEntries(params)).toEqual({
      page: '2',
      pageSize: '50',
      sort: 'recent_choice_desc',
      search: '广州',
      publishStatus: 'archived',
      eventDateFrom: '2025-01-01',
      eventDateTo: '2026-12-31',
    });
  });

  it('omits empty optional filters', () => {
    expect(
      buildEventChoiceStatsQuery({
        page: 1,
        pageSize: 20,
        search: ' ',
        sort: 'total_desc',
      }),
    ).toBe('page=1&pageSize=20&sort=total_desc');
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  buildEventChoiceStatsResult,
  emptyChoiceStatsCounts,
  getAdminEventChoiceStats,
} from './eventChoiceStats.js';

const events = [
  {
    id: 'event-a',
    eventName: '广州马拉松',
    city: '广州',
    eventDate: new Date('2026-12-01T00:00:00.000Z'),
    publishStatus: 'published' as const,
  },
  {
    id: 'event-b',
    eventName: '历史赛事',
    city: '深圳',
    eventDate: new Date('2025-01-01T00:00:00.000Z'),
    publishStatus: 'archived' as const,
  },
];

const groups = [
  {
    eventId: 'event-a',
    choice: 'interested' as const,
    _count: { _all: 2 },
    _max: { updatedAt: new Date('2026-07-17T08:00:00.000Z') },
  },
  {
    eventId: 'event-a',
    choice: 'registered' as const,
    _count: { _all: 1 },
    _max: { updatedAt: new Date('2026-07-17T09:00:00.000Z') },
  },
  {
    eventId: 'event-b',
    choice: 'considering' as const,
    _count: { _all: 1 },
    _max: { updatedAt: new Date('2026-07-16T09:00:00.000Z') },
  },
];

describe('admin event choice stats', () => {
  it('counts distinct users separately from current event choices', () => {
    const result = buildEventChoiceStatsResult(events, groups, 3, {
      page: 1,
      pageSize: 20,
      sort: 'total_desc',
    });
    expect(result.summary).toEqual({
      anonymousUsers: 3,
      totalChoices: 4,
      interested: 2,
      considering: 1,
      registered: 1,
      events: 2,
    });
    expect(result.items[0]).toMatchObject({
      event: { id: 'event-a' },
      counts: { interested: 2, considering: 0, registered: 1, total: 3 },
      lastChoiceAt: new Date('2026-07-17T09:00:00.000Z'),
    });
  });

  it('sorts and paginates archived and current events', () => {
    const result = buildEventChoiceStatsResult(events, groups, 3, {
      page: 2,
      pageSize: 1,
      sort: 'event_date_desc',
    });
    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.event.id)).toEqual(['event-b']);
  });

  it('returns stable empty data without aggregate queries', async () => {
    const store = {
      event: { findMany: vi.fn().mockResolvedValue([]) },
      userEventChoice: { groupBy: vi.fn(), findMany: vi.fn() },
    };
    await expect(
      getAdminEventChoiceStats(
        { page: 1, pageSize: 20, sort: 'total_desc' },
        store as never,
      ),
    ).resolves.toEqual({
      summary: {
        anonymousUsers: 0,
        totalChoices: 0,
        interested: 0,
        considering: 0,
        registered: 0,
        events: 0,
      },
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    expect(store.userEventChoice.groupBy).not.toHaveBeenCalled();
  });

  it('applies search, status and event-date filters without selecting user keys', async () => {
    const store = {
      event: { findMany: vi.fn().mockResolvedValue([events[0]]) },
      userEventChoice: {
        groupBy: vi.fn().mockResolvedValue(groups.slice(0, 2)),
        findMany: vi.fn().mockResolvedValue([{ id: 'choice-1' }, { id: 'choice-2' }]),
      },
    };
    const result = await getAdminEventChoiceStats(
      {
        page: 1,
        pageSize: 20,
        sort: 'recent_choice_desc',
        search: '广州',
        publishStatus: 'published',
        eventDateFrom: new Date('2026-01-01T00:00:00.000Z'),
        eventDateTo: new Date('2026-12-31T00:00:00.000Z'),
      },
      store as never,
    );
    expect(result.summary.anonymousUsers).toBe(2);
    expect(store.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publishStatus: 'published',
          userChoices: { some: {} },
        }),
      }),
    );
    expect(store.userEventChoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ distinct: ['userKey'], select: { id: true } }),
    );
    expect(JSON.stringify(result)).not.toContain('userKey');
  });

  it('keeps explicit zero values for missing choices', () => {
    expect(emptyChoiceStatsCounts()).toEqual({
      interested: 0,
      considering: 0,
      registered: 0,
      total: 0,
    });
  });
});

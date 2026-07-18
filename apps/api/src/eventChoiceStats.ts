import { prisma } from '@worth-running/database';
import type { EventChoiceType, Prisma } from '@worth-running/database';
import type { PublishStatus } from '@worth-running/shared';

export const eventChoiceStatsSortValues = [
  'total_desc',
  'event_date_asc',
  'event_date_desc',
  'recent_choice_desc',
] as const;

export type EventChoiceStatsSort = (typeof eventChoiceStatsSortValues)[number];

export interface EventChoiceStatsQuery {
  page: number;
  pageSize: number;
  search?: string;
  publishStatus?: PublishStatus;
  eventDateFrom?: Date;
  eventDateTo?: Date;
  sort: EventChoiceStatsSort;
}

interface ChoiceGroup {
  eventId: string;
  choice: EventChoiceType;
  _count: { _all: number };
  _max: { updatedAt: Date | null };
}

interface ChoiceStatsEvent {
  id: string;
  eventName: string;
  city: string;
  eventDate: Date;
  publishStatus: PublishStatus;
}

type ChoiceStatsStore = Pick<typeof prisma, 'event' | 'userEventChoice'>;

export function emptyChoiceStatsCounts() {
  return { interested: 0, considering: 0, registered: 0, total: 0 };
}

export function buildEventChoiceStatsResult(
  events: ChoiceStatsEvent[],
  groups: ChoiceGroup[],
  distinctUsers: number,
  query: Pick<EventChoiceStatsQuery, 'page' | 'pageSize' | 'sort'>,
) {
  const groupMap = new Map<string, ReturnType<typeof emptyChoiceStatsCounts>>();
  const lastChoiceMap = new Map<string, Date>();
  const summary = {
    anonymousUsers: distinctUsers,
    totalChoices: 0,
    interested: 0,
    considering: 0,
    registered: 0,
    events: events.length,
  };

  for (const group of groups) {
    const counts = groupMap.get(group.eventId) ?? emptyChoiceStatsCounts();
    counts[group.choice] += group._count._all;
    counts.total += group._count._all;
    groupMap.set(group.eventId, counts);
    summary[group.choice] += group._count._all;
    summary.totalChoices += group._count._all;
    if (group._max.updatedAt) {
      const current = lastChoiceMap.get(group.eventId);
      if (!current || group._max.updatedAt > current) {
        lastChoiceMap.set(group.eventId, group._max.updatedAt);
      }
    }
  }

  const allItems = events.map((event) => ({
    event,
    counts: groupMap.get(event.id) ?? emptyChoiceStatsCounts(),
    lastChoiceAt: lastChoiceMap.get(event.id) ?? null,
  }));
  allItems.sort((left, right) => compareChoiceStatsItems(left, right, query.sort));

  const start = (query.page - 1) * query.pageSize;
  return {
    summary,
    items: allItems.slice(start, start + query.pageSize),
    total: allItems.length,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getAdminEventChoiceStats(
  query: EventChoiceStatsQuery,
  store: ChoiceStatsStore = prisma,
) {
  const eventWhere: Prisma.EventWhereInput = { userChoices: { some: {} } };
  if (query.search) {
    eventWhere.OR = [
      { eventName: { contains: query.search, mode: 'insensitive' } },
      { city: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.publishStatus) eventWhere.publishStatus = query.publishStatus;
  if (query.eventDateFrom || query.eventDateTo) {
    eventWhere.eventDate = {
      ...(query.eventDateFrom ? { gte: query.eventDateFrom } : {}),
      ...(query.eventDateTo ? { lte: query.eventDateTo } : {}),
    };
  }

  const events = await store.event.findMany({
    where: eventWhere,
    select: {
      id: true,
      eventName: true,
      city: true,
      eventDate: true,
      publishStatus: true,
    },
  });
  const eventIds = events.map((event) => event.id);
  if (!eventIds.length) {
    return buildEventChoiceStatsResult([], [], 0, query);
  }

  const [groups, distinctUsers] = await Promise.all([
    store.userEventChoice.groupBy({
      by: ['eventId', 'choice'],
      where: { eventId: { in: eventIds } },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    store.userEventChoice.findMany({
      where: { eventId: { in: eventIds } },
      distinct: ['userKey'],
      select: { id: true },
    }),
  ]);

  return buildEventChoiceStatsResult(events, groups, distinctUsers.length, query);
}

function compareChoiceStatsItems(
  left: {
    event: ChoiceStatsEvent;
    counts: ReturnType<typeof emptyChoiceStatsCounts>;
    lastChoiceAt: Date | null;
  },
  right: {
    event: ChoiceStatsEvent;
    counts: ReturnType<typeof emptyChoiceStatsCounts>;
    lastChoiceAt: Date | null;
  },
  sort: EventChoiceStatsSort,
) {
  let result = 0;
  if (sort === 'event_date_asc') {
    result = left.event.eventDate.getTime() - right.event.eventDate.getTime();
  } else if (sort === 'event_date_desc') {
    result = right.event.eventDate.getTime() - left.event.eventDate.getTime();
  } else if (sort === 'recent_choice_desc') {
    result = (right.lastChoiceAt?.getTime() ?? 0) - (left.lastChoiceAt?.getTime() ?? 0);
  } else {
    result = right.counts.total - left.counts.total;
  }
  return (
    result ||
    left.event.eventName.localeCompare(right.event.eventName, 'zh-CN') ||
    left.event.id.localeCompare(right.event.id)
  );
}

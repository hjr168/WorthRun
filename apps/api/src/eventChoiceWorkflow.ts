import { prisma } from '@worth-running/database';
import type { EventChoiceType } from '@worth-running/database';
import { buildPublicEventWhere } from './dataPolicy.js';

export const eventChoiceValues = ['interested', 'considering', 'registered'] as const;

export interface EventChoiceCounts {
  interested: number;
  considering: number;
  registered: number;
  total: number;
}

type ChoiceStore = Pick<typeof prisma, 'event' | 'userEventChoice'>;

export class EventChoiceNotFoundError extends Error {}

export function emptyEventChoiceCounts(): EventChoiceCounts {
  return { interested: 0, considering: 0, registered: 0, total: 0 };
}

export function mapEventChoiceCounts(
  rows: Array<{ choice: EventChoiceType; _count: { _all: number } }>,
): EventChoiceCounts {
  const counts = emptyEventChoiceCounts();
  for (const row of rows) counts[row.choice] = row._count._all;
  counts.total = counts.interested + counts.considering + counts.registered;
  return counts;
}

export async function getEventChoiceCounts(eventId: string, store: ChoiceStore = prisma) {
  const rows = await store.userEventChoice.groupBy({
    by: ['choice'],
    where: { eventId },
    _count: { _all: true },
  });
  return mapEventChoiceCounts(rows);
}

export async function setEventChoice(
  input: { userKey: string; userId?: string; eventId: string; choice: EventChoiceType },
  store: ChoiceStore = prisma,
) {
  const event = await store.event.findFirst({
    where: { id: input.eventId, ...buildPublicEventWhere() },
    select: { id: true },
  });
  if (!event) throw new EventChoiceNotFoundError('赛事不存在或未发布');

  const record = input.userId
    ? await store.userEventChoice.upsert({
        where: { userId_eventId: { userId: input.userId, eventId: input.eventId } },
        create: input,
        update: { choice: input.choice, userKey: input.userKey },
      })
    : await store.userEventChoice.upsert({
        where: { userKey_eventId: { userKey: input.userKey, eventId: input.eventId } },
        create: input,
        update: { choice: input.choice },
      });
  return { choice: record.choice, choiceCounts: await getEventChoiceCounts(input.eventId, store) };
}

export async function removeEventChoice(
  input: { userKey: string; userId?: string; eventId: string },
  store: ChoiceStore = prisma,
) {
  await store.userEventChoice.deleteMany({
    where: input.userId
      ? { userId: input.userId, eventId: input.eventId }
      : { userKey: input.userKey, eventId: input.eventId },
  });
  return { removed: true as const, choiceCounts: await getEventChoiceCounts(input.eventId, store) };
}

export async function getViewerEventChoice(
  input: { userKey: string; userId?: string; eventId: string },
  store: ChoiceStore = prisma,
) {
  const record = await store.userEventChoice.findFirst({
    where: input.userId
      ? { userId: input.userId, eventId: input.eventId }
      : { userKey: input.userKey, eventId: input.eventId },
    select: { choice: true },
  });
  return { choice: record?.choice ?? null };
}

export async function listViewerEventChoices(
  input: { userKey: string; userId?: string; choice?: EventChoiceType },
  store: ChoiceStore = prisma,
) {
  const choices = await store.userEventChoice.findMany({
    where: input.userId
      ? { userId: input.userId, choice: input.choice }
      : { userKey: input.userKey, choice: input.choice },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
  const events = await store.event.findMany({
    where: { id: { in: choices.map((item) => item.eventId) }, ...buildPublicEventWhere() },
    select: {
      id: true,
      eventName: true,
      city: true,
      eventDate: true,
      distanceItems: true,
      signupStatus: true,
      signupDeadline: true,
      runJudgement: true,
      judgementSummary: true,
      judgementReasons: true,
      tags: true,
      updatedAt: true,
      sourceCheckedAt: true,
    },
  });
  const eventMap = new Map(events.map((event) => [event.id, event]));
  const items = choices.map((item) => ({
    id: item.id,
    eventId: item.eventId,
    choice: item.choice,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    event: eventMap.get(item.eventId) ?? null,
    eventAvailable: eventMap.has(item.eventId),
  }));
  items.sort((left, right) => {
    if (left.event && right.event)
      return left.event.eventDate.getTime() - right.event.eventDate.getTime();
    if (left.event) return -1;
    if (right.event) return 1;
    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });
  return { items };
}

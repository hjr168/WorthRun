import { createHmac } from 'node:crypto';
import { prisma } from '@worth-running/database';
import type { EventInteractionAction } from '@worth-running/database';
import { chinaDateOnly } from '@worth-running/shared';
import { buildPublicEventWhere } from './dataPolicy.js';

export const interactionActions = ['event_detail_view', 'official_link_copy'] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export function interactionUserHash(secret: string, userKey: string) {
  return createHmac('sha256', secret).update(userKey).digest('hex');
}

export function interactionOccurredDate(now: Date = new Date()) {
  return new Date(`${chinaDateOnly(now)}T00:00:00.000Z`);
}

export function conversionRate(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

export async function recordEventInteraction(input: {
  userKey: string;
  eventId: string;
  action: EventInteractionAction;
  secret: string;
  now?: Date;
}) {
  const occurredDate = interactionOccurredDate(input.now);
  const userKeyHash = interactionUserHash(input.secret, input.userKey);
  await prisma.eventInteraction.upsert({
    where: {
      userKeyHash_eventId_action_occurredDate: {
        userKeyHash,
        eventId: input.eventId,
        action: input.action,
        occurredDate,
      },
    },
    create: { userKeyHash, eventId: input.eventId, action: input.action, occurredDate },
    update: {},
  });
}

export async function getInteractionStats(days: 7 | 30, now: Date = new Date()) {
  const today = interactionOccurredDate(now);
  const sinceDate = new Date(today.getTime() - (days - 1) * DAY_MS);
  const sinceTimestamp = sinceDate;
  const [
    detailViews,
    detailUsers,
    officialClicks,
    officialUsers,
    favoriteAdds,
    shares,
    preferenceUsers,
  ] = await Promise.all([
    prisma.eventInteraction.count({
      where: { action: 'event_detail_view', occurredDate: { gte: sinceDate } },
    }),
    prisma.eventInteraction.findMany({
      where: { action: 'event_detail_view', occurredDate: { gte: sinceDate } },
      distinct: ['userKeyHash'],
      select: { userKeyHash: true },
    }),
    prisma.eventInteraction.count({
      where: { action: 'official_link_copy', occurredDate: { gte: sinceDate } },
    }),
    prisma.eventInteraction.findMany({
      where: { action: 'official_link_copy', occurredDate: { gte: sinceDate } },
      distinct: ['userKeyHash'],
      select: { userKeyHash: true },
    }),
    prisma.userFavorite.count({
      where: { createdAt: { gte: sinceTimestamp }, event: buildPublicEventWhere(now) },
    }),
    prisma.shareRecord.count({
      where: { createdAt: { gte: sinceTimestamp }, event: buildPublicEventWhere(now) },
    }),
    prisma.userPreference.count({ where: { updatedAt: { gte: sinceTimestamp } } }),
  ]);

  return {
    days,
    detailViews,
    detailUsers: detailUsers.length,
    officialClicks,
    officialUsers: officialUsers.length,
    favoriteAdds,
    shares,
    preferenceUsers,
    officialClickRate: conversionRate(officialClicks, detailViews),
    favoriteRate: conversionRate(favoriteAdds, detailViews),
    shareRate: conversionRate(shares, detailViews),
  };
}

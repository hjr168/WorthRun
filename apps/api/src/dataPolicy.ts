import type { Prisma } from '@worth-running/database';
import {
  chinaDateOnly,
  greaterBayAreaCityValues,
  isFutureChinaDate,
  isGreaterBayAreaCity,
} from '@worth-running/shared';

export function publishBoundaryError(city: string, eventDate: string, now: Date = new Date()) {
  if (!isGreaterBayAreaCity(city)) return '当前仅允许发布粤港澳大湾区赛事';
  if (!isFutureChinaDate(eventDate, now)) return '只能发布北京时间未来日期的赛事';
  return null;
}

export function buildPublicEventWhere(now: Date = new Date()): Prisma.EventWhereInput {
  return {
    publishStatus: 'published',
    city: { in: greaterBayAreaCityValues },
    eventDate: { gt: new Date(`${chinaDateOnly(now)}T00:00:00.000Z`) },
  };
}

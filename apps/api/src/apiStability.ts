import { prisma } from '@worth-running/database';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const routeGroups = [
  '/health',
  '/api/feedback',
  '/api/admin',
  '/api/events',
  '/api/event-choices',
  '/api/interactions',
  '/api/preferences',
  '/api/favorites',
  '/api/share-records',
  '/api/checklist',
] as const;

export function apiErrorHour(now: Date) {
  return new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
}

export function apiRouteGroup(path: string) {
  return routeGroups.find((group) => path === group || path.startsWith(`${group}/`)) || '/api/other';
}

export function recordApiErrorMetric(input: {
  path: string;
  category: string;
  now?: Date;
}) {
  const bucketStart = apiErrorHour(input.now || new Date());
  const routeGroup = apiRouteGroup(input.path);
  return prisma.apiErrorMetric.upsert({
    where: { bucketStart_routeGroup_category: { bucketStart, routeGroup, category: input.category } },
    create: { bucketStart, routeGroup, category: input.category, count: 1 },
    update: { count: { increment: 1 } },
  });
}

export interface ApiErrorMetricRow {
  bucketStart: Date;
  routeGroup: string;
  category: string;
  count: number;
}

function aggregateMetrics(rows: ApiErrorMetricRow[]) {
  const byCategory: Record<string, number> = {};
  const byRoute: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    total += row.count;
    byCategory[row.category] = (byCategory[row.category] || 0) + row.count;
    byRoute[row.routeGroup] = (byRoute[row.routeGroup] || 0) + row.count;
  }
  return { total, byCategory, byRoute };
}

export function buildApiErrorSummary(rows: ApiErrorMetricRow[], now: Date = new Date()) {
  const since24h = new Date(now.getTime() - DAY_MS);
  const since7d = new Date(now.getTime() - 7 * DAY_MS);
  return {
    last24h: aggregateMetrics(rows.filter((row) => row.bucketStart >= since24h)),
    last7d: aggregateMetrics(rows.filter((row) => row.bucketStart >= since7d)),
  };
}

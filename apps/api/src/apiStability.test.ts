import { describe, expect, it } from 'vitest';
import { apiErrorHour, apiRouteGroup, buildApiErrorSummary } from './apiStability.js';

describe('api stability metrics', () => {
  it('uses stable hourly buckets and bounded route groups', () => {
    expect(apiErrorHour(new Date('2026-07-18T10:59:59.999Z')).toISOString()).toBe(
      '2026-07-18T10:00:00.000Z',
    );
    expect(apiRouteGroup('/api/events/private-id')).toBe('/api/events');
    expect(apiRouteGroup('/api/admin/users/secret-id')).toBe('/api/admin');
    expect(apiRouteGroup('/unknown/private-id')).toBe('/api/other');
  });

  it('aggregates 24 hour and 7 day errors without raw details', () => {
    const now = new Date('2026-07-18T12:00:00.000Z');
    const summary = buildApiErrorSummary(
      [
        { bucketStart: new Date('2026-07-18T10:00:00.000Z'), routeGroup: '/api/events', category: 'internal_error', count: 2 },
        { bucketStart: new Date('2026-07-15T10:00:00.000Z'), routeGroup: '/health', category: 'database_error', count: 3 },
        { bucketStart: new Date('2026-07-01T10:00:00.000Z'), routeGroup: '/api/other', category: 'internal_error', count: 9 },
      ],
      now,
    );
    expect(summary.last24h).toEqual({
      total: 2,
      byCategory: { internal_error: 2 },
      byRoute: { '/api/events': 2 },
    });
    expect(summary.last7d.total).toBe(5);
  });
});

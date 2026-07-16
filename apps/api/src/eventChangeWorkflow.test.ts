import { describe, expect, it, vi } from 'vitest';
import {
  EventChangeConflictError,
  buildEventChangeAlertWhere,
  getEventChangeAlertSummary,
  listEventChangeAlerts,
  previewEventChangeResolution,
  resolveEventChangeAlert,
} from './eventChangeWorkflow.js';

const event = {
  id: 'event-1',
  eventName: '广州马拉松',
  city: '广州市',
  eventDate: new Date('2026-12-20T00:00:00.000Z'),
  distanceItems: ['马拉松'],
  signupStatus: 'signup_open',
  signupDeadline: new Date('2026-10-01T15:59:59.999Z'),
  officialUrl: 'https://race.example/register',
  publishStatus: 'published',
  updatedAt: new Date('2026-07-16T01:00:00.000Z'),
};

function alert(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alert-1',
    eventId: event.id,
    sourceId: 'source-1',
    status: 'open',
    severity: 'critical',
    changedFields: ['eventDate', 'officialUrl'],
    beforeValue: {
      eventDate: '2026-12-20',
      officialUrl: 'https://race.example/register',
    },
    afterValue: {
      eventDate: '2026-12-27',
      officialUrl: 'https://race.example/new-register',
    },
    evidence: [],
    sourceUrl: 'https://race.example/notice',
    updatedAt: new Date('2026-07-16T02:00:00.000Z'),
    event,
    source: { id: 'source-1', name: '官方来源', sourceLevel: 'official' },
    ...overrides,
  };
}

describe('event change alert queries', () => {
  it('builds status, severity, field and search filters', () => {
    expect(
      buildEventChangeAlertWhere({
        status: 'open',
        severity: 'critical',
        changedField: 'eventDate',
        search: '广州',
      }),
    ).toEqual({
      status: 'open',
      severity: 'critical',
      changedFields: { has: 'eventDate' },
      OR: [
        { event: { eventName: { contains: '广州', mode: 'insensitive' } } },
        { source: { name: { contains: '广州', mode: 'insensitive' } } },
      ],
    });
  });

  it('returns bounded pagination with event and source details', async () => {
    const store = {
      eventChangeAlert: {
        findMany: vi.fn().mockResolvedValue([alert()]),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    const result = await listEventChangeAlerts({ page: 2, pageSize: 100 }, store as never);
    expect(result).toMatchObject({ total: 1, page: 2, pageSize: 50 });
    expect(store.eventChangeAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 50 }),
    );
  });

  it('calculates summary counters including stale published events', async () => {
    const count = vi
      .fn()
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(5);
    count.mockReset();
    count
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(5);
    const eventCount = vi.fn().mockResolvedValueOnce(6).mockResolvedValueOnce(4);
    const store = { eventChangeAlert: { count }, event: { count: eventCount } };
    const result = await getEventChangeAlertSummary(
      new Date('2026-07-16T08:00:00.000Z'),
      store as never,
    );
    expect(result).toEqual({
      open: 7,
      critical: 2,
      important: 3,
      stalePublishedEvents: 6,
      checkedWithin7Days: 4,
      appliedWithin30Days: 5,
    });
  });
});

describe('event change resolution', () => {
  it('previews only selected fields and returns optimistic-lock snapshots', async () => {
    const store = { eventChangeAlert: { findUnique: vi.fn().mockResolvedValue(alert()) } };
    const result = await previewEventChangeResolution(
      'alert-1',
      { action: 'apply_fields', fields: ['officialUrl'], note: '确认官方入口已变更' },
      new Date('2026-07-16T08:00:00.000Z'),
      store as never,
    );
    expect(result).toMatchObject({
      ready: true,
      changes: {
        officialUrl: {
          before: 'https://race.example/register',
          after: 'https://race.example/new-register',
        },
      },
      expected: {
        alertUpdatedAt: '2026-07-16T02:00:00.000Z',
        eventUpdatedAt: '2026-07-16T01:00:00.000Z',
      },
    });
  });

  it('rejects fields that are absent from the alert or have empty source values', async () => {
    const store = {
      eventChangeAlert: {
        findUnique: vi.fn().mockResolvedValue(
          alert({
            changedFields: ['officialUrl'],
            afterValue: { officialUrl: null },
          }),
        ),
      },
    };
    const result = await previewEventChangeResolution(
      'alert-1',
      { action: 'apply_fields', fields: ['eventDate', 'officialUrl'], note: '检查字段白名单' },
      new Date(),
      store as never,
    );
    expect(result.ready).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining(['field_not_changed:eventDate', 'empty_source_value:officialUrl']),
    );
  });

  it('returns a conflict without writes when either snapshot changed', async () => {
    const row = alert();
    const tx = {
      eventChangeAlert: { findUnique: vi.fn().mockResolvedValue(row), update: vi.fn() },
      event: { update: vi.fn() },
      adminOperationLog: { create: vi.fn() },
    };
    const store = { $transaction: (callback: (value: typeof tx) => unknown) => callback(tx) };

    await expect(
      resolveEventChangeAlert(
        'alert-1',
        {
          action: 'apply_fields',
          fields: ['eventDate'],
          note: '确认赛事日期变更',
          expected: {
            alertUpdatedAt: '2026-07-16T02:00:00.000Z',
            eventUpdatedAt: '2026-07-16T00:00:00.000Z',
          },
          adminUserId: 'admin-1',
        },
        new Date(),
        store as never,
      ),
    ).rejects.toBeInstanceOf(EventChangeConflictError);
    expect(tx.event.update).not.toHaveBeenCalled();
    expect(tx.eventChangeAlert.update).not.toHaveBeenCalled();
  });

  it('applies selected fields, supersedes older alerts and writes an operation log', async () => {
    const row = alert();
    const updatedEvent = {
      ...event,
      eventDate: new Date('2026-12-27T00:00:00.000Z'),
      updatedAt: new Date('2026-07-16T08:00:00.000Z'),
    };
    const tx = {
      eventChangeAlert: {
        findUnique: vi.fn().mockResolvedValue(row),
        update: vi.fn().mockResolvedValue({ ...row, status: 'applied' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
      },
      event: { update: vi.fn().mockResolvedValue(updatedEvent) },
      adminOperationLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const store = { $transaction: (callback: (value: typeof tx) => unknown) => callback(tx) };

    const result = await resolveEventChangeAlert(
      'alert-1',
      {
        action: 'apply_fields',
        fields: ['eventDate'],
        note: '确认官方公告的新日期',
        expected: {
          alertUpdatedAt: '2026-07-16T02:00:00.000Z',
          eventUpdatedAt: '2026-07-16T01:00:00.000Z',
        },
        adminUserId: 'admin-1',
      },
      new Date('2026-07-16T08:00:00.000Z'),
      store as never,
    );

    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: { eventDate: new Date('2026-12-27T00:00:00.000Z') },
    });
    expect(tx.eventChangeAlert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'superseded' }) }),
    );
    expect(tx.adminOperationLog.create).toHaveBeenCalledOnce();
    expect(result.sourceReviewPending).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  AiIngestError,
  buildCandidateFingerprint,
  formatRunStatus,
  runEventSource,
} from './runEventSource.js';

describe('buildCandidateFingerprint', () => {
  it('uses normalized eventName city date', () => {
    expect(buildCandidateFingerprint(' 广州黄埔马拉松 ', '广州', '2026-12-20')).toBe(
      '广州黄埔马拉松|广州|2026-12-20',
    );
  });
});

describe('formatRunStatus', () => {
  it('formats compact batch counters for the source row', () => {
    expect(
      formatRunStatus({
        fetched: 20,
        created: 12,
        updated: 3,
        skippedReviewed: 5,
        duplicateEvents: 2,
        candidateIds: [],
      }),
    ).toBe('success:fetched=20,created=12,updated=3,skipped=5,duplicates=2');
  });
});

describe('runEventSource', () => {
  it('processes bounded China Athletics pages and records the run', async () => {
    const eventSourceUpdate = vi.fn().mockResolvedValue({});
    const eventSourceRunUpdate = vi.fn().mockResolvedValue({});
    const store = {
      eventSource: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'source-1',
          name: '中国田协目录',
          sourceType: 'chinaath_api',
          status: 'active',
          entryUrl: null,
          searchQuery: null,
          allowedDomains: [],
          cityHints: [],
          scheduleEnabled: true,
          scheduleIntervalHours: 24,
          pageSize: 20,
          maxPagesPerRun: 2,
          nextPage: 1,
          nextRunAt: null,
          lastRunAt: null,
          lastRunStatus: null,
          lastSuccessAt: null,
          consecutiveFailures: 0,
          runLockToken: null,
          runLockExpiresAt: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        update: eventSourceUpdate,
      },
      eventSourceRun: {
        create: vi.fn().mockResolvedValue({ id: 'run-1' }),
        update: eventSourceRunUpdate,
      },
    };
    const fetchChinaAth = vi
      .fn()
      .mockResolvedValueOnce({
        candidates: [{}],
        totalAvailable: 60,
        pageNo: 1,
        pageSize: 20,
        pageCount: 3,
      })
      .mockResolvedValueOnce({
        candidates: [{}],
        totalAvailable: 60,
        pageNo: 2,
        pageSize: 20,
        pageCount: 3,
      });
    const persistCandidates = vi
      .fn()
      .mockResolvedValueOnce({
        fetched: 1,
        created: 1,
        updated: 0,
        skippedReviewed: 0,
        duplicateEvents: 0,
        candidateIds: ['candidate-1'],
      })
      .mockResolvedValueOnce({
        fetched: 1,
        created: 0,
        updated: 1,
        skippedReviewed: 0,
        duplicateEvents: 1,
        candidateIds: ['candidate-2'],
      });

    const result = await runEventSource('source-1', {
      trigger: 'scheduled',
      now: new Date('2026-07-14T00:00:00.000Z'),
      dependencies: {
        store: store as never,
        acquireLease: vi.fn().mockResolvedValue({ token: 'lease', expiresAt: new Date() }),
        releaseLease: vi.fn().mockResolvedValue(undefined),
        fetchChinaAth: fetchChinaAth as never,
        persistCandidates: persistCandidates as never,
        clock: () => new Date('2026-07-14T00:01:00.000Z'),
      },
    });

    expect(result).toMatchObject({
      runId: 'run-1',
      trigger: 'scheduled',
      startPage: 1,
      endPage: 2,
      pageCount: 2,
      nextPage: 3,
      fetched: 2,
      created: 1,
      updated: 1,
      duplicateEvents: 1,
    });
    expect(fetchChinaAth).toHaveBeenNthCalledWith(1, {
      pageNo: 1,
      pageSize: 20,
      cityHints: [],
    });
    expect(fetchChinaAth).toHaveBeenNthCalledWith(2, {
      pageNo: 2,
      pageSize: 20,
      cityHints: [],
    });
    expect(eventSourceRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'succeeded' }) }),
    );
    expect(eventSourceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nextPage: 3 }) }),
    );
  });

  it('returns a conflict without creating a run when the lease is held', async () => {
    const createRun = vi.fn();
    const store = {
      eventSource: {
        findUnique: vi.fn().mockResolvedValue({ id: 'source-1', status: 'active' }),
        update: vi.fn(),
      },
      eventSourceRun: { create: createRun, update: vi.fn() },
    };

    await expect(
      runEventSource('source-1', {
        dependencies: {
          store: store as never,
          acquireLease: vi.fn().mockResolvedValue(null),
        },
      }),
    ).rejects.toEqual(new AiIngestError(409, '赛事源正在运行'));
    expect(createRun).not.toHaveBeenCalled();
  });
});

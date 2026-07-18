import { describe, expect, it, vi } from 'vitest';
import {
  candidateExclusionReason,
  decideCandidateWrite,
  persistEventCandidates,
  resolveCandidateOfficialUrl,
  shouldPersistCandidateByDate,
} from './persistEventCandidates.js';

function sourceItem(overrides: Record<string, unknown> = {}) {
  return {
    candidate: {
      eventName: '广州马拉松',
      city: '广州市',
      eventDate: '2026-12-20',
      distanceItems: ['马拉松'],
      signupStatus: 'open',
      signupDeadline: '2026-10-01T15:59:59.999Z',
      officialUrl: 'https://race.example/register',
      sourceName: '官方来源',
      sourceUrl: 'https://race.example/notice',
      sourceLevel: 'official',
      runJudgement: 'unverified',
      judgementSummary: '',
      judgementReasons: [],
      suitableFor: [],
      notSuitableFor: [],
      tags: [],
      evidence: [
        { field: 'eventDate', sourceUrl: 'https://race.example/notice', quote: '比赛日期' },
      ],
      confidence: {},
      ...overrides,
    },
    sourceExternalId: 'race-1',
    rawPayload: null,
    extractorVersion: 'test',
    aiModel: null,
    aiPromptVersion: null,
  };
}

function reviewedStore(sourceLevel: string, eventOverrides: Record<string, unknown> = {}) {
  const executeRaw = vi.fn().mockResolvedValue(1);
  const alertUpsert = vi.fn().mockResolvedValue({ createdAt: new Date('2026-07-16T00:00:00Z') });
  const markSummaryStale = vi.fn().mockResolvedValue({ count: 1 });
  const store = {
    eventSource: { findUnique: vi.fn().mockResolvedValue({ sourceLevel }) },
    eventCandidate: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'candidate-1',
        status: 'accepted',
        acceptedEventId: 'event-1',
        mergedInto: null,
      }),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    event: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'event-1',
        publishStatus: 'published',
        eventDate: new Date('2026-12-20T00:00:00Z'),
        distanceItems: ['马拉松'],
        signupStatus: 'open',
        signupDeadline: new Date('2026-10-01T15:59:59.999Z'),
        officialUrl: 'https://race.example/register',
        ...eventOverrides,
      }),
      findFirst: vi.fn(),
    },
    eventChangeAlert: { findUnique: vi.fn().mockResolvedValue(null), upsert: alertUpsert },
    eventSourceSummary: { updateMany: markSummaryStale },
    $executeRaw: executeRaw,
  };
  return { store, executeRaw, alertUpsert, markSummaryStale };
}

describe('decideCandidateWrite', () => {
  it('creates a new candidate when no source record exists', () => {
    expect(decideCandidateWrite(null)).toBe('create');
  });

  it('updates candidates that are still awaiting review', () => {
    expect(decideCandidateWrite({ status: 'new' })).toBe('update');
    expect(decideCandidateWrite({ status: 'needs_review' })).toBe('update');
  });

  it('does not overwrite reviewed candidates', () => {
    expect(decideCandidateWrite({ status: 'accepted' })).toBe('skip_reviewed');
    expect(decideCandidateWrite({ status: 'rejected' })).toBe('skip_reviewed');
    expect(decideCandidateWrite({ status: 'merged' })).toBe('skip_reviewed');
  });
});

describe('resolveCandidateOfficialUrl', () => {
  it('uses an official source URL as the confirmation link', () => {
    expect(resolveCandidateOfficialUrl('official', null, 'https://official.example/notice')).toBe(
      'https://official.example/notice',
    );
    expect(
      resolveCandidateOfficialUrl(
        'official',
        'https://official.example/event',
        'https://official.example/notice',
      ),
    ).toBe('https://official.example/event');
  });

  it('never promotes a community discovery URL', () => {
    expect(
      resolveCandidateOfficialUrl('community', null, 'https://community.example/event'),
    ).toBeNull();
  });

  it('never promotes an aggregate World Athletics calendar query to an event official URL', () => {
    expect(
      resolveCandidateOfficialUrl(
        'official',
        null,
        'https://worldathletics.org/competition/calendar-results?disciplineId=2&regionId=13188432&startDate=2026-07-18&endDate=2027-07-18',
      ),
    ).toBeNull();
  });
});

describe('candidateExclusionReason', () => {
  const now = new Date('2026-07-13T16:30:00.000Z');

  it('filters expired candidates before region checks', () => {
    expect(candidateExclusionReason({ eventDate: '2026-07-14', city: '北京市' }, now)).toBe(
      'expired',
    );
  });

  it('filters future candidates outside the Greater Bay Area', () => {
    expect(candidateExclusionReason({ eventDate: '2026-07-15', city: '北京市' }, now)).toBe(
      'outside_region',
    );
  });

  it('keeps future Greater Bay Area and missing-date candidates', () => {
    expect(candidateExclusionReason({ eventDate: '2026-07-15', city: '广州市' }, now)).toBeNull();
    expect(candidateExclusionReason({ eventDate: null, city: '香港特别行政区' }, now)).toBeNull();
  });
});

describe('shouldPersistCandidateByDate', () => {
  const now = new Date('2026-07-13T16:30:00.000Z');

  it('keeps only dates strictly after today in China time', () => {
    expect(shouldPersistCandidateByDate('2026-07-13', now)).toBe(false);
    expect(shouldPersistCandidateByDate('2026-07-14', now)).toBe(false);
    expect(shouldPersistCandidateByDate('2026-07-15', now)).toBe(true);
  });

  it('keeps missing or invalid dates for manual completion', () => {
    expect(shouldPersistCandidateByDate(null, now)).toBe(true);
    expect(shouldPersistCandidateByDate(undefined, now)).toBe(true);
    expect(shouldPersistCandidateByDate('not-a-date', now)).toBe(true);
  });
});

describe('persistEventCandidates reviewed candidate monitoring', () => {
  const now = new Date('2026-07-16T08:00:00.000Z');

  it('refreshes only sourceCheckedAt when an accepted official candidate is unchanged', async () => {
    const { store, executeRaw, alertUpsert } = reviewedStore('official');

    const result = await persistEventCandidates('source-1', [sourceItem() as never], now, {
      sourceRunId: 'run-1',
      store: store as never,
    });

    expect(result).toMatchObject({
      skippedReviewed: 1,
      changeAlertsCreated: 0,
      changeAlertsExisting: 0,
    });
    expect(executeRaw).toHaveBeenCalledOnce();
    expect(alertUpsert).not.toHaveBeenCalled();
    expect(store.eventCandidate.update).not.toHaveBeenCalled();
  });

  it('upserts one alert for changed official data without modifying event business fields', async () => {
    const { store, executeRaw, alertUpsert, markSummaryStale } = reviewedStore('trusted');

    const result = await persistEventCandidates(
      'source-1',
      [sourceItem({ eventDate: '2026-12-27' }) as never],
      now,
      { sourceRunId: 'run-1', store: store as never },
    );

    expect(result).toMatchObject({
      skippedReviewed: 1,
      changeAlertsCreated: 1,
      changeAlertsExisting: 0,
    });
    expect(alertUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventId: 'event-1',
          sourceId: 'source-1',
          sourceRunId: 'run-1',
          sourceCandidateId: 'candidate-1',
          changedFields: ['eventDate'],
          severity: 'critical',
        }),
      }),
    );
    expect(executeRaw).toHaveBeenCalledOnce();
    expect(markSummaryStale).toHaveBeenCalledWith({
      where: { eventId: 'event-1', status: 'published' },
      data: { staleAt: now },
    });
    expect(store.eventCandidate.update).not.toHaveBeenCalled();
  });

  it('does not monitor accepted candidates from secondary sources', async () => {
    const { store, executeRaw, alertUpsert } = reviewedStore('secondary');

    const result = await persistEventCandidates(
      'source-1',
      [sourceItem({ eventDate: '2026-12-27' }) as never],
      now,
      { store: store as never },
    );

    expect(result.skippedReviewed).toBe(1);
    expect(executeRaw).not.toHaveBeenCalled();
    expect(alertUpsert).not.toHaveBeenCalled();
  });
});

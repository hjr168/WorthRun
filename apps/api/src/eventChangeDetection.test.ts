import { describe, expect, it } from 'vitest';
import { detectEventChanges } from './eventChangeDetection.js';

const current = {
  eventDate: new Date('2026-11-01T00:00:00.000Z'),
  distanceItems: ['马拉松', '半程马拉松'],
  signupStatus: 'open',
  signupDeadline: new Date('2026-09-30T15:59:59.999Z'),
  officialUrl: 'https://race.example.com/register',
};

describe('detectEventChanges', () => {
  it('normalizes dates across string and Date values', () => {
    expect(
      detectEventChanges('source-1', current, {
        eventDate: '2026-11-01',
      }),
    ).toBeNull();

    const diff = detectEventChanges('source-1', current, { eventDate: '2026-11-08' });
    expect(diff?.changedFields).toEqual(['eventDate']);
    expect(diff?.afterValue.eventDate).toBe('2026-11-08');
    expect(diff?.severity).toBe('critical');
  });

  it('deduplicates and sorts distances before comparing', () => {
    expect(
      detectEventChanges('source-1', current, {
        distanceItems: [' 半程马拉松 ', '马拉松', '半程马拉松'],
      }),
    ).toBeNull();

    const diff = detectEventChanges('source-1', current, {
      distanceItems: ['10公里', '半程马拉松'],
    });
    expect(diff?.changedFields).toEqual(['distanceItems']);
    expect(diff?.afterValue.distanceItems).toEqual(['10公里', '半程马拉松']);
    expect(diff?.severity).toBe('normal');
  });

  it('ignores tracking parameters, from and trailing slashes in official URLs', () => {
    expect(
      detectEventChanges('source-1', current, {
        officialUrl: 'https://race.example.com/register/?utm_source=wechat&from=timeline',
      }),
    ).toBeNull();

    const diff = detectEventChanges('source-1', current, {
      officialUrl: 'https://race.example.com/new-register?channel=official&utm_medium=post',
    });
    expect(diff?.changedFields).toEqual(['officialUrl']);
    expect(diff?.afterValue.officialUrl).toBe(
      'https://race.example.com/new-register?channel=official',
    );
    expect(diff?.severity).toBe('important');
  });

  it('ignores the rolling date window in World Athletics calendar URLs', () => {
    const worldAthleticsCurrent = {
      ...current,
      officialUrl:
        'https://worldathletics.org/competition/calendar-results?disciplineId=2&regionType=country&regionId=13188432&startDate=2026-07-17&endDate=2027-07-17',
    };

    expect(
      detectEventChanges('source-1', worldAthleticsCurrent, {
        officialUrl:
          'https://worldathletics.org/competition/calendar-results?disciplineId=2&regionType=country&regionId=13188432&startDate=2026-07-18&endDate=2027-07-18',
      }),
    ).toBeNull();

    expect(
      detectEventChanges('source-1', worldAthleticsCurrent, {
        officialUrl:
          'https://worldathletics.org/competition/calendar-results?disciplineId=2&regionType=country&regionId=999&startDate=2026-07-18&endDate=2027-07-18',
      })?.changedFields,
    ).toEqual(['officialUrl']);
  });

  it('compares signup status and deadline while ignoring empty source values', () => {
    const diff = detectEventChanges('source-1', current, {
      signupStatus: 'closed',
      signupDeadline: '2026-09-20T15:59:59.999Z',
    });
    expect(diff?.changedFields).toEqual(['signupStatus', 'signupDeadline']);
    expect(diff?.severity).toBe('important');

    expect(
      detectEventChanges('source-1', current, {
        eventDate: null,
        distanceItems: [],
        signupStatus: 'unknown',
        signupDeadline: null,
        officialUrl: ' ',
      }),
    ).toBeNull();
  });

  it('detects cancellation and postponement keywords without normal-copy false positives', () => {
    const cancelled = detectEventChanges(
      'source-1',
      current,
      {},
      '组委会公告：本届赛事取消，报名费将原路退回。',
    );
    expect(cancelled?.changedFields).toEqual(['cancellationSignal']);
    expect(cancelled?.severity).toBe('critical');

    const postponed = detectEventChanges(
      'source-1',
      current,
      {},
      '因天气原因赛事延期举行，新日期另行通知。',
    );
    expect(postponed?.changedFields).toEqual(['postponementSignal']);
    expect(postponed?.severity).toBe('critical');

    expect(
      detectEventChanges(
        'source-1',
        current,
        {},
        '报名成功后如需取消参赛资格，请按赛事规则办理。比赛如期举行。',
      ),
    ).toBeNull();
  });

  it('creates a stable SHA-256 fingerprint from normalized changes and source id', () => {
    const first = detectEventChanges('source-1', current, {
      distanceItems: ['10公里', '半程马拉松'],
      officialUrl: 'https://race.example.com/new?utm_source=a',
    });
    const second = detectEventChanges('source-1', current, {
      officialUrl: 'https://race.example.com/new/?utm_source=b',
      distanceItems: ['半程马拉松', '10公里', '10公里'],
    });
    const otherSource = detectEventChanges('source-2', current, {
      distanceItems: ['10公里', '半程马拉松'],
      officialUrl: 'https://race.example.com/new',
    });

    expect(first?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first?.fingerprint).toBe(second?.fingerprint);
    expect(first?.fingerprint).not.toBe(otherSource?.fingerprint);
  });
});

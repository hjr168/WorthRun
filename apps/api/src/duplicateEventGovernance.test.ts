import { describe, expect, it } from 'vitest';
import { arePotentialDuplicateEvents } from './eventPublishWorkflow.js';

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-a',
    eventName: '2026 銀河娛樂澳門國際馬拉松',
    city: '澳门特别行政区',
    eventDate: new Date('2026-12-06T00:00:00.000Z'),
    distanceItems: ['马拉松', '半程马拉松'],
    officialUrl: 'https://www.macaomarathon.com/zh/information',
    sourceUrl: 'https://www.macaomarathon.com/zh/information',
    ...overrides,
  };
}

describe('published event duplicate detection', () => {
  it('matches simplified and traditional names for the same city, date and distance', () => {
    expect(
      arePotentialDuplicateEvents(
        event(),
        event({
          id: 'event-b',
          eventName: '2026 银河娱乐澳门国际马拉松',
          city: '澳门',
          officialUrl: 'https://another.example/event',
          sourceUrl: 'https://another.example/event',
        }),
      ),
    ).toBe(true);
  });

  it('does not match events on another date or without overlapping distances', () => {
    expect(
      arePotentialDuplicateEvents(
        event(),
        event({ id: 'event-b', eventDate: new Date('2026-12-07') }),
      ),
    ).toBe(false);
    expect(
      arePotentialDuplicateEvents(event(), event({ id: 'event-c', distanceItems: ['10公里'] })),
    ).toBe(false);
  });

  it('matches shared official evidence even when names differ', () => {
    expect(
      arePotentialDuplicateEvents(
        event(),
        event({ id: 'event-b', eventName: '澳门年度路跑', sourceUrl: null }),
      ),
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { parseWorldAthleticsHtml } from './worldAthletics.js';

describe('parseWorldAthleticsHtml', () => {
  it('keeps future Hong Kong road races and maps stable external ids', () => {
    const payload = {
      props: {
        pageProps: {
          initialEvents: {
            results: [
              {
                id: 1,
                name: 'Hong Kong 10K',
                venue: 'Hong Kong (HKG)',
                startDate: '2026-10-04',
                disciplines: 'Road Running',
                rankingCategory: 'B',
              },
              {
                id: 2,
                name: 'Old Race',
                venue: 'Hong Kong (HKG)',
                startDate: '2026-07-01',
                disciplines: 'Road Running',
              },
              {
                id: 3,
                name: 'Track Meet',
                venue: 'Hong Kong (HKG)',
                startDate: '2026-10-05',
                disciplines: 'Track and Field',
              },
              {
                id: 4,
                name: 'Macao 10K',
                venue: 'Macao (MAC)',
                startDate: '2026-10-06',
                disciplines: 'Road Running',
              },
            ],
          },
        },
      },
    };
    const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script></html>`;
    const result = parseWorldAthleticsHtml(html, {
      url: 'https://worldathletics.example/calendar',
      startDate: '2026-07-17',
      endDate: '2027-07-17',
      pageSize: 20,
    });

    expect(result.totalAvailable).toBe(1);
    expect(result.candidates[0]).toMatchObject({
      sourceExternalId: 'world-athletics-1',
      candidate: { city: '香港', eventDate: '2026-10-04', sourceLevel: 'official' },
    });
  });

  it('fails visibly when the page structure changes', () => {
    expect(() =>
      parseWorldAthleticsHtml('<html></html>', {
        url: 'https://example.com',
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        pageSize: 20,
      }),
    ).toThrow('缺少结构化数据');
  });
});

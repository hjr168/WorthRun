import { describe, expect, it, vi } from 'vitest';
import { fetchChinaAthOfficialCandidates } from './chinaAthOfficial.js';

describe('fetchChinaAthOfficialCandidates', () => {
  it('maps official API records without inventing registration URLs', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          code: 0,
          msg: 'SUCCESS',
          data: {
            results: [
              {
                raceId: 1000419209,
                raceName: '2026天津团泊湖半程马拉松',
                raceGrade: 'A',
                raceTime: '2026-09-27',
                raceAddress: '天津市/天津市/静海区',
                raceItem: '["半程"]',
                raceScale: null,
              },
            ],
            totalCount: 2830,
            pageNo: 1,
            pageSize: 20,
            pageCount: 142,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await fetchChinaAthOfficialCandidates({ fetchImpl, pageNo: 7, pageSize: 50 });

    expect(result.totalAvailable).toBe(2830);
    expect(result).toMatchObject({ pageNo: 1, pageSize: 20, pageCount: 142 });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ pageNo: 7, pageSize: 20 });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      sourceExternalId: '1000419209',
      extractorVersion: 'chinaath-api-v1',
      candidate: {
        eventName: '2026天津团泊湖半程马拉松',
        city: '天津市',
        eventDate: '2026-09-27',
        distanceItems: ['半程'],
        officialUrl: null,
        sourceLevel: 'official',
      },
    });
  });

  it('filters the current batch using city hints', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            results: [
              {
                raceId: 1,
                raceName: '天津测试半程马拉松',
                raceGrade: 'A',
                raceTime: '2026-09-27',
                raceAddress: '天津市/天津市/静海区',
                raceItem: '["半程"]',
              },
              {
                raceId: 2,
                raceName: '长春测试半程马拉松',
                raceGrade: 'B',
                raceTime: '2026-09-06',
                raceAddress: '吉林省/长春市/',
                raceItem: '["半程"]',
              },
            ],
            totalCount: 2,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await fetchChinaAthOfficialCandidates({ fetchImpl, cityHints: ['长春市'] });

    expect(result.candidates.map((item) => item.sourceExternalId)).toEqual(['2']);
  });

  it('rejects malformed or unsuccessful responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, msg: 'blocked' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(fetchChinaAthOfficialCandidates({ fetchImpl })).rejects.toThrow(
      '中国田协赛事接口返回失败',
    );
  });

  it('returns an empty batch when the requested page is past the remote page count', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { results: [], totalCount: 3, pageNo: 4, pageSize: 20, pageCount: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await fetchChinaAthOfficialCandidates({ fetchImpl, pageNo: 4 });

    expect(result).toMatchObject({
      totalAvailable: 3,
      pageNo: 4,
      pageSize: 20,
      pageCount: 1,
      candidates: [],
    });
  });
});

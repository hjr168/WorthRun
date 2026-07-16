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
                raceName: '2026广州测试半程马拉松',
                raceGrade: 'A',
                raceTime: '2026-09-27',
                raceAddress: '广东省/广州市/天河区',
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

    const result = await fetchChinaAthOfficialCandidates({
      fetchImpl,
      pageNo: 7,
      pageSize: 50,
      cityHints: ['广州'],
    });

    expect(result.totalAvailable).toBe(2830);
    expect(result).toMatchObject({ pageNo: 1, pageSize: 20, pageCount: 142 });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      provinceId: '440000',
      cityId: '440100',
      pageNo: 7,
      pageSize: 20,
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      sourceExternalId: '1000419209',
      extractorVersion: 'chinaath-api-v1',
      candidate: {
        eventName: '2026广州测试半程马拉松',
        city: '广州市',
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
                raceName: '深圳测试半程马拉松',
                raceGrade: 'A',
                raceTime: '2026-09-27',
                raceAddress: '广东省/深圳市/南山区',
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

    const result = await fetchChinaAthOfficialCandidates({ fetchImpl, cityHints: ['深圳市'] });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ cityId: '440300' });
    expect(result.candidates.map((item) => item.sourceExternalId)).toEqual(['1']);
  });

  it('rejects malformed or unsuccessful responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, msg: 'blocked' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      fetchChinaAthOfficialCandidates({ fetchImpl, cityHints: ['广州'] }),
    ).rejects.toThrow('中国田协赛事接口返回失败');
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

    const result = await fetchChinaAthOfficialCandidates({
      fetchImpl,
      pageNo: 4,
      cityHints: ['广州'],
    });

    expect(result).toMatchObject({
      totalAvailable: 3,
      pageNo: 4,
      pageSize: 20,
      pageCount: 1,
      candidates: [],
    });
  });

  it('rejects missing, multiple, Hong Kong, or Macao city hints', async () => {
    await expect(fetchChinaAthOfficialCandidates()).rejects.toThrow('一个大湾区内地城市');
    await expect(fetchChinaAthOfficialCandidates({ cityHints: ['广州', '深圳'] })).rejects.toThrow(
      '一个大湾区内地城市',
    );
    await expect(fetchChinaAthOfficialCandidates({ cityHints: ['香港'] })).rejects.toThrow(
      '一个大湾区内地城市',
    );
  });
});

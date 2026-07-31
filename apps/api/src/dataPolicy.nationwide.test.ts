import { afterEach, describe, expect, it } from 'vitest';
import {
  buildPublicEventWhere,
  publishBoundaryError,
  resolveRegionForBoundary,
} from './dataPolicy.js';

const original = process.env.NATIONWIDE_DISCOVERY_ENABLED;
afterEach(() => {
  if (original === undefined) delete process.env.NATIONWIDE_DISCOVERY_ENABLED;
  else process.env.NATIONWIDE_DISCOVERY_ENABLED = original;
});

describe('全国发现发布边界', () => {
  it('keeps legacy GBA behavior behind the flag', () => {
    delete process.env.NATIONWIDE_DISCOVERY_ENABLED;
    expect(publishBoundaryError('杭州', '2099-10-01')).toContain('大湾区');
    expect(publishBoundaryError('广州', '2099-10-01')).toBeNull();
  });

  it('auto-fills missing province/city codes from the city name when enabled', () => {
    process.env.NATIONWIDE_DISCOVERY_ENABLED = 'true';
    // 城市可识别但代码缺失：用城市名兜底，不再报"必须补齐代码"
    expect(publishBoundaryError('杭州', '2099-10-01')).toBeNull();
    expect(publishBoundaryError('杭州市', '2099-10-01')).toBeNull();
    // 已填正确代码：照常通过
    expect(
      publishBoundaryError('杭州', '2099-10-01', new Date(), {
        provinceCode: '330000',
        cityCode: '330100',
      }),
    ).toBeNull();
    expect(buildPublicEventWhere()).toMatchObject({
      provinceCode: { in: expect.arrayContaining(['330000']) },
      cityCode: { not: null },
    });
  });

  it('still rejects unsupported regions and mismatched codes when enabled', () => {
    process.env.NATIONWIDE_DISCOVERY_ENABLED = 'true';
    // 城市不在首期全国目录：仍报错
    expect(publishBoundaryError('西宁', '2099-10-01')).toContain('不在首期全国公路跑目录');
    // 省市代码与城市不一致：仍报错
    expect(
      publishBoundaryError('杭州', '2099-10-01', new Date(), {
        provinceCode: '330000',
        cityCode: '320500', // 苏州的市级代码，与杭州不一致
      }),
    ).toContain('待审核');
  });
});

describe('resolveRegionForBoundary', () => {
  it('fills missing codes from the city name', () => {
    expect(resolveRegionForBoundary('杭州')).toEqual({
      provinceCode: '330000',
      cityCode: '330100',
    });
    expect(resolveRegionForBoundary('杭州市')).toEqual({
      provinceCode: '330000',
      cityCode: '330100',
    });
  });

  it('preserves provided codes and does not overwrite them', () => {
    expect(
      resolveRegionForBoundary('杭州', { provinceCode: '330000', cityCode: '330100' }),
    ).toEqual({ provinceCode: '330000', cityCode: '330100' });
  });

  it('returns null codes when the city is not supported', () => {
    expect(resolveRegionForBoundary('西宁')).toEqual({ provinceCode: null, cityCode: null });
    expect(resolveRegionForBoundary('')).toEqual({ provinceCode: null, cityCode: null });
  });
});

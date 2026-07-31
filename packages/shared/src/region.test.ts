import { describe, expect, it } from 'vitest';
import { getSupportedProvinces, resolveSupportedRegion, supportedProvinceCodes } from './region.js';

describe('首期全国行政区目录', () => {
  it('contains the nine mainland provinces/municipalities plus Hong Kong and Macau', () => {
    expect(supportedProvinceCodes).toEqual(expect.arrayContaining(['110000', '310000', '320000', '330000', '440000', '510000', '500000', '420000', '350000', '810000', '820000']));
  });

  it('maps legacy city names and preserves six digit codes', () => {
    expect(resolveSupportedRegion('杭州市')).toMatchObject({ provinceCode: '330000', cityCode: '330100', cityName: '杭州' });
    expect(resolveSupportedRegion('香港')).toMatchObject({ provinceCode: '810000', cityCode: '810100' });
    expect(getSupportedProvinces().every((province) => province.cities.every((city) => /^\d{6}$/.test(city.cityCode)))).toBe(true);
  });

  it('keeps the first-release city-level directory complete for the supported regions', () => {
    const expectedCounts: Record<string, number> = {
      '110000': 1,
      '310000': 1,
      '320000': 13,
      '330000': 11,
      '440000': 21,
      '510000': 21,
      '500000': 1,
      '420000': 14,
      '350000': 9,
      '810000': 1,
      '820000': 1,
    };
    expect(Object.fromEntries(getSupportedProvinces().map((item) => [item.provinceCode, item.cities.length]))).toEqual(expectedCounts);
    expect(resolveSupportedRegion('攀枝花市')).toMatchObject({ provinceCode: '510000', cityCode: '510400' });
    expect(resolveSupportedRegion('阿坝藏族羌族自治州')).toMatchObject({ provinceCode: '510000', cityCode: '513200' });
    expect(resolveSupportedRegion('神农架林区')).toMatchObject({ provinceCode: '420000', cityCode: '429004' });
  });
});

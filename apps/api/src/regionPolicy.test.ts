import { describe, expect, it } from 'vitest';
import {
  chinaDateOnly,
  isGreaterBayAreaCity,
  normalizeGreaterBayAreaCity,
} from '@worth-running/shared';

describe('Greater Bay Area region policy', () => {
  it('normalizes mainland and special administrative region aliases', () => {
    expect(normalizeGreaterBayAreaCity('广东省广州市')).toBe('广州');
    expect(normalizeGreaterBayAreaCity('深圳市')).toBe('深圳');
    expect(normalizeGreaterBayAreaCity('香港特别行政区')).toBe('香港');
    expect(normalizeGreaterBayAreaCity('澳门特别行政区')).toBe('澳门');
  });

  it('rejects cities outside the target region', () => {
    expect(isGreaterBayAreaCity('北京市')).toBe(false);
    expect(isGreaterBayAreaCity('中山市')).toBe(true);
  });

  it('uses the China calendar date at the UTC boundary', () => {
    expect(chinaDateOnly(new Date('2026-07-13T15:59:59.000Z'))).toBe('2026-07-13');
    expect(chinaDateOnly(new Date('2026-07-13T16:00:00.000Z'))).toBe('2026-07-14');
  });
});

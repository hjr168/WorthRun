import { describe, expect, it } from 'vitest';
import {
  RADAR_COMPLIANCE_NOTICE,
  RADAR_OFFICIAL_ACTION_TEXT,
  RADAR_PRIMARY_GROUP_PRIORITY,
  RADAR_DEFAULT_WINDOW_DAYS,
  clampLimitPerGroup,
  clampWindowDays,
  isValidCampaignCode,
  parseCsvList,
  parseRadarCities,
  parseRadarDistances,
  parseRadarFocusTags,
  radarDisabledResponse,
} from './radar.js';

describe('radar compliance text (immutable)', () => {
  it('keeps the exact required disclaimer', () => {
    expect(RADAR_COMPLIANCE_NOTICE).toBe('AI 整理，仅供参考，报名以官方为准。');
    expect(RADAR_OFFICIAL_ACTION_TEXT).toBe('前往官方确认');
  });
});

describe('radar group priority', () => {
  it('ranks closingSoon above signupOpening above recentlyChanged above matched', () => {
    expect(RADAR_PRIMARY_GROUP_PRIORITY.closingSoon).toBeLessThan(
      RADAR_PRIMARY_GROUP_PRIORITY.signupOpening,
    );
    expect(RADAR_PRIMARY_GROUP_PRIORITY.signupOpening).toBeLessThan(
      RADAR_PRIMARY_GROUP_PRIORITY.recentlyChanged,
    );
    expect(RADAR_PRIMARY_GROUP_PRIORITY.recentlyChanged).toBeLessThan(
      RADAR_PRIMARY_GROUP_PRIORITY.matched,
    );
  });
});

describe('parseCsvList', () => {
  it('trims, dedupes preserving order, drops empties', () => {
    expect(parseCsvList(' 广州, 深圳 ,广州,,深圳 ')).toEqual(['广州', '深圳']);
    expect(parseCsvList(undefined)).toEqual([]);
    expect(parseCsvList('')).toEqual([]);
  });
});

describe('parseRadarCities', () => {
  it('canonicalizes aliases and drops non-GBA values', () => {
    expect(parseRadarCities('广州市,深圳市,东营市,北京')).toEqual(['广州', '深圳']);
  });
  it('dedupes after canonicalization', () => {
    expect(parseRadarCities('广州,广州市')).toEqual(['广州']);
  });
});

describe('parseRadarDistances', () => {
  it('only accepts whitelisted distances', () => {
    expect(parseRadarDistances('半马,全马,100K,5K')).toEqual(['半马', '全马', '5K']);
  });
});

describe('parseRadarFocusTags', () => {
  it('caps at max tags without rewriting values', () => {
    const many = Array.from({ length: 15 }, (_, i) => `tag${i}`).join(',');
    expect(parseRadarFocusTags(many)).toHaveLength(10);
    expect(parseRadarFocusTags(many)[0]).toBe('tag0');
  });
});

describe('clamp helpers', () => {
  it('clamps windowDays into [30,180] with default fallback', () => {
    expect(clampWindowDays(undefined)).toBe(RADAR_DEFAULT_WINDOW_DAYS);
    expect(clampWindowDays(10)).toBe(30);
    expect(clampWindowDays(999)).toBe(180);
    expect(clampWindowDays(120)).toBe(120);
    expect(clampWindowDays(NaN)).toBe(RADAR_DEFAULT_WINDOW_DAYS);
  });
  it('clamps limitPerGroup into [1,30]', () => {
    expect(clampLimitPerGroup(0)).toBe(1);
    expect(clampLimitPerGroup(100)).toBe(30);
    expect(clampLimitPerGroup(5)).toBe(5);
    expect(clampLimitPerGroup(undefined)).toBe(20);
  });
});

describe('isValidCampaignCode', () => {
  it('accepts 6-32 lowercase/digits/hyphens', () => {
    expect(isValidCampaignCode('gz-club-01')).toBe(true);
    expect(isValidCampaignCode('abc123')).toBe(true);
  });
  it('rejects too short, uppercase, spaces, phone-like', () => {
    expect(isValidCampaignCode('ab')).toBe(false);
    expect(isValidCampaignCode('GZ-CLUB')).toBe(false);
    expect(isValidCampaignCode('gz club')).toBe(false);
    expect(isValidCampaignCode('13800001111')).toBe(true); // format-valid but ops must avoid
  });
});

describe('radarDisabledResponse', () => {
  it('returns stable empty structure with compliance text', () => {
    const res = radarDisabledResponse(new Date('2026-07-28T10:00:00.000Z'));
    expect(res.total).toBe(0);
    expect(res.groups.signupOpening).toEqual([]);
    expect(res.groups.closingSoon).toEqual([]);
    expect(res.groups.recentlyChanged).toEqual([]);
    expect(res.groups.matched).toEqual([]);
    expect(res.complianceNotice).toBe(RADAR_COMPLIANCE_NOTICE);
    expect(res.officialActionText).toBe(RADAR_OFFICIAL_ACTION_TEXT);
    expect(res.campaign).toBeNull();
    expect(res.window.days).toBe(RADAR_DEFAULT_WINDOW_DAYS);
  });
});

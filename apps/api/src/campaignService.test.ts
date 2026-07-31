import { describe, expect, it } from 'vitest';
import {
  validateCampaignCode,
  validateDateRange,
  campaignChannelTypeValues,
  campaignStatusValues,
} from './campaignService.js';

describe('validateCampaignCode', () => {
  it('accepts valid codes', () => {
    expect(validateCampaignCode('gz-club-01')).toBeNull();
    expect(validateCampaignCode('sz2026')).toBeNull();
  });
  it('rejects invalid formats', () => {
    expect(validateCampaignCode('ab')).not.toBeNull(); // too short
    expect(validateCampaignCode('GZ-CLUB')).not.toBeNull(); // uppercase
    expect(validateCampaignCode('gz club')).not.toBeNull(); // space
    expect(validateCampaignCode('')).not.toBeNull();
  });
});

describe('validateDateRange', () => {
  it('accepts missing or valid ranges', () => {
    expect(validateDateRange(null, null)).toBeNull();
    expect(validateDateRange('2026-08-01', null)).toBeNull();
    expect(validateDateRange('2026-08-01', '2026-08-31')).toBeNull();
  });
  it('rejects start after end', () => {
    expect(validateDateRange('2026-08-31', '2026-08-01')).not.toBeNull();
  });
});

describe('campaign enum coverage', () => {
  it('has the full channel type list from the handoff spec', () => {
    expect(campaignChannelTypeValues).toEqual([
      'wechat_group',
      'wechat_moments',
      'xiaohongshu',
      'running_club',
      'running_store',
      'coach',
      'photographer',
      'organizer',
      'public_account',
      'other',
    ]);
  });
  it('has active/paused/archived statuses', () => {
    expect(campaignStatusValues).toEqual(['active', 'paused', 'archived']);
  });
});

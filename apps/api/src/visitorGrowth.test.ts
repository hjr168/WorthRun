import { describe, expect, it } from 'vitest';
import {
  resolveAttribution,
  mergeFirstTouch,
  visitorActivityDate,
  visitorActionFields,
} from './visitorGrowth.js';

describe('visitorActivityDate', () => {
  it('uses Beijing calendar day (UTC+8)', () => {
    // 2026-07-28T16:30:00Z -> Beijing 2026-07-29 00:30 -> day 2026-07-29
    expect(visitorActivityDate(new Date('2026-07-28T16:30:00.000Z')).toISOString()).toBe(
      '2026-07-29T00:00:00.000Z',
    );
    // 2026-07-28T15:30:00Z -> Beijing 2026-07-28 23:30 -> day 2026-07-28
    expect(visitorActivityDate(new Date('2026-07-28T15:30:00.000Z')).toISOString()).toBe(
      '2026-07-28T00:00:00.000Z',
    );
  });
});

describe('resolveAttribution', () => {
  it('adopts resolved campaign id and trims entry page / channel', () => {
    const a = resolveAttribution({
      resolvedCampaignId: 'cmp1',
      referralShareToken: 'tok',
      entryPage: '  radar  ',
      channel: 'campaign',
    });
    expect(a).toEqual({
      campaignId: 'cmp1',
      referralShareToken: 'tok',
      firstEntryPage: 'radar',
      firstChannel: 'campaign',
    });
  });

  it('returns nulls when nothing valid provided (direct/organic)', () => {
    expect(resolveAttribution({})).toEqual({
      campaignId: null,
      referralShareToken: null,
      firstEntryPage: null,
      firstChannel: null,
    });
  });

  it('drops blank referral token', () => {
    expect(resolveAttribution({ referralShareToken: '' }).referralShareToken).toBeNull();
  });

  it('caps entry page and channel length', () => {
    const long = 'x'.repeat(100);
    const a = resolveAttribution({ entryPage: long, channel: long });
    expect(a.firstEntryPage).toHaveLength(64);
    expect(a.firstChannel).toHaveLength(64);
  });
});

describe('mergeFirstTouch (first-touch non-overwrite)', () => {
  it('writes campaign only when current is null', () => {
    expect(mergeFirstTouch({ campaignId: null, referralShareToken: null, firstEntryPage: null, firstChannel: null }, resolveAttribution({ resolvedCampaignId: 'cmp1' }))).toEqual({ campaignId: 'cmp1' });
  });

  it('does NOT overwrite an existing campaign attribution', () => {
    const out = mergeFirstTouch(
      { campaignId: 'old', referralShareToken: null, firstEntryPage: null, firstChannel: null },
      resolveAttribution({ resolvedCampaignId: 'new' }),
    );
    expect(out).toEqual({});
    expect(out.campaignId).toBeUndefined();
  });

  it('preserves existing share token when a second share token arrives', () => {
    const out = mergeFirstTouch(
      { campaignId: null, referralShareToken: 'first', firstEntryPage: null, firstChannel: null },
      resolveAttribution({ referralShareToken: 'second' }),
    );
    expect(out.referralShareToken).toBeUndefined();
  });

  it('keeps both campaign and share token when both arrive first time (they are independent)', () => {
    const out = mergeFirstTouch(
      { campaignId: null, referralShareToken: null, firstEntryPage: null, firstChannel: null },
      resolveAttribution({ resolvedCampaignId: 'cmp1', referralShareToken: 'tok' }),
    );
    expect(out).toEqual({ campaignId: 'cmp1', referralShareToken: 'tok' });
  });

  it('does not set fields to null (incoming null never clears)', () => {
    const out = mergeFirstTouch(
      { campaignId: null, referralShareToken: null, firstEntryPage: null, firstChannel: null },
      resolveAttribution({}),
    );
    expect(out).toEqual({});
  });
});

describe('visitorActionFields', () => {
  it('matches the schema boolean action set', () => {
    expect(visitorActionFields.has('viewedRadar')).toBe(true);
    expect(visitorActionFields.has('setPreference')).toBe(true);
    expect(visitorActionFields.has('addedFavorite')).toBe(true);
    expect(visitorActionFields.has('setChoice')).toBe(true);
    expect(visitorActionFields.has('subscribedReminder')).toBe(true);
    expect(visitorActionFields.has('copiedOfficial')).toBe(true);
    expect(visitorActionFields.has('startedShare')).toBe(true);
  });
});

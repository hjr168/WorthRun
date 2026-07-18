import { describe, expect, it } from 'vitest';
import {
  buildVerificationGroups,
  getEventDisplayStatus,
  getEventNotice,
  hasChoiceCounts,
  updateChoiceCounts,
} from './event-detail';

const emptyCounts = { interested: 0, considering: 0, registered: 0, total: 0 };

describe('event detail view model', () => {
  it('maps signup states and gives an ended event precedence', () => {
    const now = new Date('2026-07-17T04:00:00.000Z');
    expect(getEventDisplayStatus('signup_open', '2026-07-18', now).text).toBe('报名中');
    expect(getEventDisplayStatus('closing_soon', '2026-07-18', now).text).toBe('即将截止');
    expect(getEventDisplayStatus('not_started', '2026-07-18', now).text).toBe('即将开放');
    expect(getEventDisplayStatus('closed', '2026-07-18', now).text).toBe('报名已截止');
    expect(getEventDisplayStatus('unknown', '2026-07-18', now).text).toBe('待确认');
    expect(getEventDisplayStatus('signup_open', '2026-07-16', now).text).toBe('比赛已结束');
  });

  it('prioritizes source review notices and hides complete-state notices', () => {
    expect(getEventNotice({ sourceReviewPending: true, infoStatus: 'verified' })?.tone).toBe(
      'review',
    );
    expect(getEventNotice({ sourceSummaryStale: true, infoStatus: 'verified' })?.tone).toBe(
      'review',
    );
    expect(getEventNotice({ infoStatus: 'pending_verify' })?.tone).toBe('pending');
    expect(getEventNotice({ infoStatus: 'verified' })).toBeNull();
  });

  it('optimistically adds, switches, and removes mutually exclusive choices', () => {
    const added = updateChoiceCounts(emptyCounts, null, 'interested');
    expect(added).toEqual({ interested: 1, considering: 0, registered: 0, total: 1 });
    expect(updateChoiceCounts(added, 'interested', 'registered')).toEqual({
      interested: 0,
      considering: 0,
      registered: 1,
      total: 1,
    });
    expect(updateChoiceCounts(added, 'interested', null)).toEqual(emptyCounts);
    expect(hasChoiceCounts(emptyCounts)).toBe(false);
    expect(hasChoiceCounts(added)).toBe(true);
  });

  it('groups only real checklist records into confirmed and pending information', () => {
    expect(
      buildVerificationGroups('verified', [
        { groupName: '报名', itemName: '报名时间', itemStatus: 'verified' },
        { groupName: '路线', itemName: '关门时间', itemStatus: 'pending_verify' },
      ]),
    ).toEqual({
      confirmedItems: ['报名时间'],
      pendingItems: ['关门时间'],
      hasItemRecords: true,
    });
    expect(buildVerificationGroups('pending_verify', [])).toEqual({
      confirmedItems: [],
      pendingItems: [],
      hasItemRecords: false,
    });
  });
});

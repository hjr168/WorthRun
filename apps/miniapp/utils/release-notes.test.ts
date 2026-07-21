import { describe, expect, it } from 'vitest';
import { hasUnreadRelease } from './release-notes';

describe('release note unread state', () => {
  it('shows unread for first install and a newly published id', () => {
    expect(hasUnreadRelease('release-1', '')).toBe(true);
    expect(hasUnreadRelease('release-2', 'release-1')).toBe(true);
  });

  it('hides unread after reading or when no release exists', () => {
    expect(hasUnreadRelease('release-1', 'release-1')).toBe(false);
    expect(hasUnreadRelease(null, '')).toBe(false);
  });
});

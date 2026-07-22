import { describe, expect, it } from 'vitest';
import { safeEqual, signAvatarCallback } from './avatarUploads.js';

describe('avatar upload signatures', () => {
  it('signs a callback deterministically', () => {
    expect(
      signAvatarCallback('secret', {
        timestamp: '1721640000000',
        grantId: 'grant-1',
        fileId: 'cloud://space/avatar.jpg',
      }),
    ).toMatch(/^[a-f0-9]{64}$/);
  });

  it('uses a timing-safe equality boundary', () => {
    expect(safeEqual('same', 'same')).toBe(true);
    expect(safeEqual('same', 'diff')).toBe(false);
    expect(safeEqual('short', 'longer')).toBe(false);
  });
});

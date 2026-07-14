import { describe, expect, it, vi } from 'vitest';
import { acquireEventSourceLease, releaseEventSourceLease } from './eventSourceLease.js';

describe('event source database lease', () => {
  it('atomically acquires an expired or empty lease', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const now = new Date('2026-07-14T03:00:00.000Z');

    const lease = await acquireEventSourceLease('source-1', now, {
      updateMany,
      createToken: () => 'lease-token',
    });

    expect(lease).toEqual({
      token: 'lease-token',
      expiresAt: new Date('2026-07-14T03:30:00.000Z'),
    });
    expect(lease).not.toBeNull();
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'source-1',
        OR: [{ runLockToken: null }, { runLockExpiresAt: null }, { runLockExpiresAt: { lte: now } }],
      },
      data: { runLockToken: 'lease-token', runLockExpiresAt: lease!.expiresAt },
    });
  });

  it('returns null when another execution owns the lease', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });

    await expect(
      acquireEventSourceLease('source-1', new Date(), {
        updateMany,
        createToken: () => 'unused',
      }),
    ).resolves.toBeNull();
  });

  it('only releases the matching token', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });

    await releaseEventSourceLease('source-1', 'lease-token', { updateMany });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'source-1', runLockToken: 'lease-token' },
      data: { runLockToken: null, runLockExpiresAt: null },
    });
  });
});

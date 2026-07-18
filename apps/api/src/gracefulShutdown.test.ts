import { describe, expect, it, vi } from 'vitest';
import { runGracefulShutdown } from './gracefulShutdown.js';

describe('graceful shutdown', () => {
  it('closes the server before disconnecting the database', async () => {
    const order: string[] = [];
    const result = await runGracefulShutdown({
      closeServer: async () => {
        order.push('server');
      },
      disconnectDatabase: async () => {
        order.push('database');
      },
      timeoutMs: 100,
    });
    expect(result).toEqual({ timedOut: false });
    expect(order).toEqual(['server', 'database']);
  });

  it('continues database cleanup after the server timeout', async () => {
    vi.useFakeTimers();
    const disconnectDatabase = vi.fn(async () => undefined);
    const pending = runGracefulShutdown({
      closeServer: () => new Promise<void>(() => undefined),
      disconnectDatabase,
      timeoutMs: 10,
    });
    await vi.advanceTimersByTimeAsync(10);
    await expect(pending).resolves.toEqual({ timedOut: true });
    expect(disconnectDatabase).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

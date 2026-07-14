import { describe, expect, it, vi } from 'vitest';
import {
  hasMemoryBudget,
  readLinuxMemAvailable,
  runNextDueEventSource,
} from './eventSourceCron.js';

describe('event source cron', () => {
  it('runs only the earliest active due source', async () => {
    const now = new Date('2026-07-14T04:00:00.000Z');
    const findFirst = vi.fn().mockResolvedValue({ id: 'source-1' });
    const runner = vi.fn().mockResolvedValue({ runId: 'run-1' });

    await expect(runNextDueEventSource({ now, findFirst, runner: runner as never })).resolves.toEqual(
      { runId: 'run-1' },
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { status: 'active', scheduleEnabled: true, nextRunAt: { lte: now } },
      orderBy: { nextRunAt: 'asc' },
      select: { id: true },
    });
    expect(runner).toHaveBeenCalledWith('source-1', { trigger: 'scheduled' });
  });

  it('exits cleanly when no source is due', async () => {
    const runner = vi.fn();

    await expect(
      runNextDueEventSource({
        now: new Date(),
        findFirst: vi.fn().mockResolvedValue(null),
        runner: runner as never,
      }),
    ).resolves.toBeNull();
    expect(runner).not.toHaveBeenCalled();
  });

  it('parses Linux MemAvailable and enforces a bounded threshold', () => {
    const available = readLinuxMemAvailable('MemTotal: 1024000 kB\nMemAvailable: 300000 kB\n');

    expect(available).toBeCloseTo(292.96875);
    expect(hasMemoryBudget(available, undefined)).toBe(true);
    expect(hasMemoryBudget(200, '256')).toBe(false);
    expect(hasMemoryBudget(150, '10')).toBe(true);
    expect(hasMemoryBudget(500, '999')).toBe(false);
  });
});

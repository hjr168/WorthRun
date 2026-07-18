import { describe, expect, it, vi } from 'vitest';
import {
  emptyEventChoiceCounts,
  getEventChoiceCounts,
  mapEventChoiceCounts,
  removeEventChoice,
  setEventChoice,
} from './eventChoiceWorkflow.js';

describe('event choice workflow', () => {
  it('maps all aggregate rows and keeps zero values', () => {
    expect(
      mapEventChoiceCounts([
        { choice: 'interested', _count: { _all: 3 } },
        { choice: 'registered', _count: { _all: 1 } },
      ]),
    ).toEqual({ interested: 3, considering: 0, registered: 1, total: 4 });
    expect(emptyEventChoiceCounts()).toEqual({
      interested: 0,
      considering: 0,
      registered: 0,
      total: 0,
    });
  });

  it('upserts one choice and returns fresh counts', async () => {
    const store = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: 'event-1' }) },
      userEventChoice: {
        upsert: vi.fn().mockResolvedValue({ choice: 'considering' }),
        groupBy: vi.fn().mockResolvedValue([{ choice: 'considering', _count: { _all: 2 } }]),
      },
    };
    await expect(
      setEventChoice(
        { userKey: 'user-1', eventId: 'event-1', choice: 'considering' },
        store as never,
      ),
    ).resolves.toEqual({
      choice: 'considering',
      choiceCounts: { interested: 0, considering: 2, registered: 0, total: 2 },
    });
    expect(store.userEventChoice.upsert).toHaveBeenCalledTimes(1);
  });

  it('removes idempotently and recalculates counts', async () => {
    const store = {
      event: {},
      userEventChoice: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        groupBy: vi.fn().mockResolvedValue([]),
      },
    };
    await expect(
      removeEventChoice({ userKey: 'user-1', eventId: 'event-1' }, store as never),
    ).resolves.toEqual({ removed: true, choiceCounts: emptyEventChoiceCounts() });
  });

  it('uses one grouped query for public counts', async () => {
    const store = {
      event: {},
      userEventChoice: { groupBy: vi.fn().mockResolvedValue([]) },
    };
    await getEventChoiceCounts('event-1', store as never);
    expect(store.userEventChoice.groupBy).toHaveBeenCalledWith({
      by: ['choice'],
      where: { eventId: 'event-1' },
      _count: { _all: true },
    });
  });
});

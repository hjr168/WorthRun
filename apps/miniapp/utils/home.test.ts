import { describe, expect, it } from 'vitest';
import { groupHomeEvents } from './home';

function event(id: string, runJudgement = 'watch', signupStatus = 'not_started') {
  return { id, runJudgement, signupStatus } as never;
}

describe('home event groups', () => {
  it('groups events by priority without duplicates', () => {
    const groups = groupHomeEvents([
      event('both', 'priority', 'closing_soon'),
      event('priority', 'priority'),
      event('closing', 'watch', 'closing_soon'),
      event('recent'),
    ]);
    expect(groups.priorityEvents.map((item) => item.id)).toEqual(['both', 'priority']);
    expect(groups.closingEvents.map((item) => item.id)).toEqual(['closing']);
    expect(groups.recentEvents.map((item) => item.id)).toEqual(['recent']);
    expect(new Set(Object.values(groups).flat().map((item) => item.id)).size).toBe(4);
  });
});

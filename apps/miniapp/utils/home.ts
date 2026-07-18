import type { EventSummary } from './api';

export function groupHomeEvents(events: EventSummary[]) {
  const used = new Set<string>();
  const take = (predicate: (event: EventSummary) => boolean, limit: number) =>
    events.filter((event) => !used.has(event.id) && predicate(event)).slice(0, limit).map((event) => {
      used.add(event.id);
      return event;
    });
  return {
    priorityEvents: take((event) => event.runJudgement === 'priority', 3),
    closingEvents: take((event) => event.signupStatus === 'closing_soon', 3),
    recentEvents: take(() => true, 4),
  };
}

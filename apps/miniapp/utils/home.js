"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupHomeEvents = groupHomeEvents;
function groupHomeEvents(events) {
    const used = new Set();
    const take = (predicate, limit) => events.filter((event) => !used.has(event.id) && predicate(event)).slice(0, limit).map((event) => {
        used.add(event.id);
        return event;
    });
    return {
        priorityEvents: take((event) => event.runJudgement === 'priority', 3),
        closingEvents: take((event) => event.signupStatus === 'closing_soon', 3),
        recentEvents: take(() => true, 4),
    };
}

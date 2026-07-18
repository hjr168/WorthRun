"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEventDisplayStatus = getEventDisplayStatus;
exports.getEventNotice = getEventNotice;
exports.updateChoiceCounts = updateChoiceCounts;
exports.hasChoiceCounts = hasChoiceCounts;
exports.buildVerificationGroups = buildVerificationGroups;
function chinaDateKey(now) {
    const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const pad = (value) => String(value).padStart(2, '0');
    return `${chinaTime.getUTCFullYear()}-${pad(chinaTime.getUTCMonth() + 1)}-${pad(chinaTime.getUTCDate())}`;
}
function getEventDisplayStatus(signupStatus, eventDate, now = new Date()) {
    const eventDateKey = eventDate === null || eventDate === void 0 ? void 0 : eventDate.slice(0, 10);
    if (eventDateKey && eventDateKey < chinaDateKey(now)) {
        return { text: '比赛已结束', tone: 'muted' };
    }
    const statuses = {
        signup_open: { text: '报名中', tone: 'positive' },
        closing_soon: { text: '即将截止', tone: 'urgent' },
        closed: { text: '报名已截止', tone: 'neutral' },
        not_started: { text: '即将开放', tone: 'neutral' },
        unknown: { text: '待确认', tone: 'muted' },
    };
    return signupStatus ? statuses[signupStatus] : statuses.unknown;
}
function getEventNotice(event) {
    if (event.sourceReviewPending) {
        return { text: '官方信息近期有更新，正在复核，请前往官方确认。', tone: 'review' };
    }
    if (event.sourceSummaryStale) {
        return { text: '来源摘要对应的信息近期有更新，请以原始来源为准。', tone: 'review' };
    }
    if (event.infoStatus === 'user_flagged') {
        return { text: '该赛事信息收到用户纠错反馈，正在核对。', tone: 'review' };
    }
    if (event.infoStatus === 'source_error') {
        return { text: '当前来源信息暂不可完整核对，请前往官方确认。', tone: 'review' };
    }
    if (event.infoStatus === 'pending_verify' || event.infoStatus === 'ai_generated') {
        return { text: '部分赛事信息仍待核实，请结合官方发布确认。', tone: 'pending' };
    }
    return null;
}
function updateChoiceCounts(counts, previousChoice, nextChoice) {
    const next = Object.assign({}, counts);
    if (previousChoice && previousChoice !== nextChoice) {
        next[previousChoice] = Math.max(0, next[previousChoice] - 1);
    }
    if (nextChoice && previousChoice !== nextChoice) {
        next[nextChoice] += 1;
    }
    next.total = next.interested + next.considering + next.registered;
    return next;
}
function hasChoiceCounts(counts) {
    return Boolean(counts && counts.total > 0);
}
function buildVerificationGroups(infoStatus, items) {
    const confirmedItems = [];
    const pendingItems = [];
    const pushUnique = (target, value) => {
        if (value && !target.includes(value))
            target.push(value);
    };
    for (const item of items || []) {
        if (item.itemStatus === 'verified')
            pushUnique(confirmedItems, item.itemName);
        else
            pushUnique(pendingItems, item.itemName);
    }
    return {
        confirmedItems,
        pendingItems,
        hasItemRecords: confirmedItems.length + pendingItems.length > 0,
    };
}

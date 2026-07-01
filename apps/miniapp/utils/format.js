"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.infoStatusLabels = exports.runJudgementLabels = exports.signupStatusLabels = exports.officialActionText = exports.complianceNotice = void 0;
exports.formatDate = formatDate;
exports.formatDateTime = formatDateTime;
exports.formatDistance = formatDistance;
exports.labelOf = labelOf;
exports.complianceNotice = 'AI 整理，仅供参考，报名以官方为准。';
exports.officialActionText = '前往官方确认';
exports.signupStatusLabels = {
    signup_open: '报名中',
    closing_soon: '即将截止',
    closed: '已截止',
    not_started: '未开始',
    unknown: '待核实',
};
exports.runJudgementLabels = {
    priority: '适合优先关注',
    watch: '可以观望',
    unverified: '信息待核实',
};
exports.infoStatusLabels = {
    ai_generated: 'AI 整理',
    pending_verify: '待核实',
    verified: '已识别',
    user_flagged: '用户反馈异常',
    source_error: '来源异常',
};
function formatDate(value) {
    if (!value)
        return '待确认';
    return value.slice(0, 10);
}
function formatDateTime(value) {
    if (!value)
        return '待确认';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return '待确认';
    const pad = (number) => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function formatDistance(items) {
    return items && items.length > 0 ? items.join(' / ') : '距离待确认';
}
function labelOf(labels, value) {
    return value ? labels[value] || value : '待确认';
}

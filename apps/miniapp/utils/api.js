"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiError = void 0;
exports.request = request;
exports.getEvents = getEvents;
exports.getEventDetail = getEventDetail;
exports.savePreference = savePreference;
exports.getPreference = getPreference;
exports.getFavorites = getFavorites;
exports.addFavorite = addFavorite;
exports.removeFavorite = removeFavorite;
exports.getEventChoice = getEventChoice;
exports.getEventChoices = getEventChoices;
exports.setEventChoice = setEventChoice;
exports.removeEventChoice = removeEventChoice;
exports.getSourceSummary = getSourceSummary;
exports.submitFeedback = submitFeedback;
exports.submitProductFeedback = submitProductFeedback;
exports.getChecklistTemplates = getChecklistTemplates;
exports.recordShare = recordShare;
exports.getShareSettings = getShareSettings;
exports.getLatestReleaseNote = getLatestReleaseNote;
exports.getReleaseNotes = getReleaseNotes;
exports.recordInteraction = recordInteraction;
const index_1 = require("../config/index");
class ApiError extends Error {
    constructor(message, statusCode, retryAfterSeconds, requestId) {
        super(message);
        this.statusCode = statusCode;
        this.retryAfterSeconds = retryAfterSeconds;
        this.requestId = requestId;
    }
}
exports.ApiError = ApiError;
function getBaseUrl() {
    return index_1.config.apiBaseUrl;
}
function toQuery(data) {
    if (!data)
        return '';
    const record = data;
    const pairs = Object.keys(record)
        .filter((key) => record[key] !== undefined && record[key] !== '')
        .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(record[key]))}`);
    return pairs.length ? `?${pairs.join('&')}` : '';
}
function request(path, options = {}) {
    const method = options.method || 'GET';
    const isGet = method === 'GET';
    const url = `${getBaseUrl()}${path}${isGet ? toQuery(options.data) : ''}`;
    if (options.loadingText)
        wx.showLoading({ title: options.loadingText, mask: true });
    return new Promise((resolve, reject) => {
        wx.request({
            url,
            method,
            data: isGet ? undefined : options.data,
            header: { 'content-type': 'application/json' },
            success(res) {
                var _a, _b;
                const data = res.data;
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(res.data);
                    return;
                }
                const message = (data === null || data === void 0 ? void 0 : data.message) || '请求失败';
                if (!options.silent)
                    wx.showToast({ title: message, icon: 'none' });
                const retryAfterHeader = ((_a = res.header) === null || _a === void 0 ? void 0 : _a['Retry-After']) || ((_b = res.header) === null || _b === void 0 ? void 0 : _b['retry-after']);
                const retryAfterSeconds = Number(retryAfterHeader);
                reject(new ApiError(message, res.statusCode, Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined, data === null || data === void 0 ? void 0 : data.requestId));
            },
            fail(error) {
                const message = error.errMsg || '网络异常';
                if (!options.silent)
                    wx.showToast({ title: message, icon: 'none' });
                reject(new ApiError(message));
            },
            complete() {
                if (options.loadingText)
                    wx.hideLoading();
            },
        });
    });
}
function getEvents(params = {}) {
    return request('/api/events', { data: params, silent: true });
}
function getEventDetail(id) {
    return request(`/api/events/${id}`, { silent: true });
}
function savePreference(preference) {
    return request('/api/preferences', {
        method: 'POST',
        data: preference,
        loadingText: '保存中',
    });
}
function getPreference(userKey) {
    return request(`/api/preferences/${userKey}`, { silent: true });
}
function getFavorites(userKey) {
    return request('/api/favorites', {
        data: { userKey },
        silent: true,
    });
}
function addFavorite(userKey, eventId) {
    return request('/api/favorites', {
        method: 'POST',
        data: { userKey, eventId },
        loadingText: '处理中',
    });
}
function removeFavorite(userKey, eventId) {
    return request(`/api/favorites/${eventId}?userKey=${encodeURIComponent(userKey)}`, {
        method: 'DELETE',
        loadingText: '处理中',
    });
}
function getEventChoice(userKey, eventId) {
    return request(`/api/event-choices/${eventId}`, {
        data: { userKey },
        silent: true,
    });
}
function getEventChoices(userKey, choice) {
    return request('/api/event-choices', {
        data: { userKey, choice },
        silent: true,
    });
}
function setEventChoice(userKey, eventId, choice) {
    return request('/api/event-choices', {
        method: 'PUT',
        data: { userKey, eventId, choice },
        silent: true,
    });
}
function removeEventChoice(userKey, eventId) {
    return request(`/api/event-choices/${eventId}?userKey=${encodeURIComponent(userKey)}`, { method: 'DELETE', silent: true });
}
function getSourceSummary(eventId) {
    return request(`/api/events/${eventId}/source-summary`, { silent: true });
}
function submitFeedback(data) {
    return request('/api/feedback', {
        method: 'POST',
        data,
        loadingText: '提交中',
        silent: true,
    });
}
function submitProductFeedback(data) {
    return request('/api/feedback', {
        method: 'POST',
        data: Object.assign(Object.assign({}, data), { scope: 'product_feedback' }),
        loadingText: '提交中',
        silent: true,
    });
}
function getChecklistTemplates(type) {
    const query = type ? `?type=${encodeURIComponent(type)}` : '';
    return request(`/api/checklist/templates${query}`, {
        silent: true,
    });
}
function recordShare(data) {
    return request('/api/share-records', { method: 'POST', data, silent: true });
}
function getShareSettings() {
    return request('/api/share-settings', { silent: true });
}
function getLatestReleaseNote() {
    return request('/api/release-notes/latest', { silent: true });
}
function getReleaseNotes(cursor, limit = 10) {
    return request('/api/release-notes', {
        data: { cursor, limit },
        silent: true,
    });
}
function recordInteraction(data) {
    return request('/api/interactions', {
        method: 'POST',
        data,
        silent: true,
    });
}

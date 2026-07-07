"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.request = request;
exports.getEvents = getEvents;
exports.getEventDetail = getEventDetail;
exports.savePreference = savePreference;
exports.getPreference = getPreference;
exports.getFavorites = getFavorites;
exports.addFavorite = addFavorite;
exports.removeFavorite = removeFavorite;
exports.submitFeedback = submitFeedback;
exports.getChecklistTemplates = getChecklistTemplates;
const index_1 = require("../config/index");
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
                const data = res.data;
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(res.data);
                    return;
                }
                const message = (data === null || data === void 0 ? void 0 : data.message) || '请求失败';
                if (!options.silent)
                    wx.showToast({ title: message, icon: 'none' });
                reject(new Error(message));
            },
            fail(error) {
                const message = error.errMsg || '网络异常';
                if (!options.silent)
                    wx.showToast({ title: message, icon: 'none' });
                reject(new Error(message));
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
function submitFeedback(data) {
    return request('/api/feedback', { method: 'POST', data, loadingText: '提交中' });
}
function getChecklistTemplates(type) {
    var query = type ? "?type=" + encodeURIComponent(type) : '';
    return request('/api/checklist/templates' + query, { silent: true });
}

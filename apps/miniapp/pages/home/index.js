"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const user_1 = require("../../utils/user");
const product_feedback_1 = require("../../utils/product-feedback");
const share_1 = require("../../utils/share");
const format_1 = require("../../utils/format");
function monthOffset(offset) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
}
function monthTabItems() {
    return [1, 2, 3, 4].map((offset) => { const value = monthOffset(offset); return { value, label: `${value.slice(5)}月` }; });
}
const DEFAULT_EVENT_COVER = '/assets/images/event-cover-default.png';
function coverUrl(value) {
    return value && !value.endsWith('event-cover-default.jpg') ? value : DEFAULT_EVENT_COVER;
}
function decorate(items, favoriteIds) {
    return items.map((item) => (Object.assign(Object.assign({}, item), { coverImageUrl: coverUrl(item.coverImageUrl), coverThumbnailUrl: coverUrl(item.coverThumbnailUrl || item.coverImageUrl), isFavorite: favoriteIds.has(item.id), dateText: (0, format_1.formatDate)(item.eventDate), signupStartAtText: (0, format_1.formatDate)(item.signupStartAt), distanceText: item.distanceItems.join(' · ') })));
}
Page({
    data: {
        loading: true,
        error: '',
        errorRequestId: '',
        userKey: '',
        preference: null,
        preferenceText: '',
        month: monthOffset(3),
        monthTabs: monthTabItems(),
        focusEvents: [],
        editorsPicks: [],
        signupSoon: [],
        recommended: [],
    },
    onLoad() { (0, share_1.enablePublicShare)(); },
    onShow() { this.load(); },
    async load() {
        const userKey = (0, user_1.getUserKey)();
        this.setData({ loading: true, error: '', errorRequestId: '', userKey });
        try {
            const preference = await (0, api_1.getPreference)(userKey).catch(() => null);
            const favorites = await (0, api_1.getFavorites)(userKey).catch(() => ({ items: [] }));
            const favoriteIds = new Set(favorites.items.map((item) => item.eventId));
            const result = await (0, api_1.getDiscoveryHome)(this.data.month, userKey);
            this.setData({
                preference,
                preferenceText: preference ? `${preference.cities.join('、') || '地区不限'} · ${preference.distances.join('、') || '距离不限'}` : '',
                focusEvents: decorate(result.focusEvents, favoriteIds),
                editorsPicks: decorate(result.editorsPicks, favoriteIds),
                signupSoon: decorate(result.signupSoon, favoriteIds),
                recommended: decorate(result.recommended, favoriteIds),
                loading: false,
            });
        }
        catch (error) {
            this.setData({ loading: false, error: error.message || '网络异常', errorRequestId: error instanceof api_1.ApiError ? error.requestId || '' : '' });
        }
    },
    selectMonth(event) {
        const month = event.currentTarget.dataset.month;
        this.setData({ month });
        this.load();
    },
    reload() { this.load(); },
    reportProblem() { (0, product_feedback_1.openProductFeedback)('home', this.data.errorRequestId || undefined); },
    openPreference() { wx.navigateTo({ url: '/pages/preferences/index' }); },
    openEvents() { wx.switchTab({ url: '/pages/events/index' }); },
    openRadar() { wx.switchTab({ url: '/pages/radar/index' }); },
    openRegion() { wx.showToast({ title: '当前浏览范围：全国', icon: 'none' }); },
    openEvent(event) {
        var _a, _b, _c;
        const id = ((_a = event.detail) === null || _a === void 0 ? void 0 : _a.id) || ((_c = (_b = event.currentTarget) === null || _b === void 0 ? void 0 : _b.dataset) === null || _c === void 0 ? void 0 : _c.id);
        if (id)
            wx.navigateTo({ url: `/pages/event-detail/index?id=${id}` });
    },
    onFocusImageError() { this.setData({ 'focusEvents[0].coverImageUrl': DEFAULT_EVENT_COVER }); },
    onEditorImageError(event) {
        this.setData({ [`editorsPicks[${Number(event.currentTarget.dataset.index)}].coverThumbnailUrl`]: DEFAULT_EVENT_COVER });
    },
    onRecommendedImageError(event) {
        this.setData({ [`recommended[${Number(event.currentTarget.dataset.index)}].coverThumbnailUrl`]: DEFAULT_EVENT_COVER });
    },
    async toggleFavorite(event) {
        const { id, isFavorite } = event.detail;
        try {
            if (isFavorite)
                await (0, api_1.removeFavorite)(this.data.userKey, id);
            else
                await (0, api_1.addFavorite)(this.data.userKey, id);
            this.load();
        }
        catch (_a) {
            wx.showToast({ title: isFavorite ? '取消收藏失败' : '收藏失败', icon: 'none' });
        }
    },
    onShareAppMessage() { (0, share_1.trackShare)('page_share', 'home'); return (0, share_1.getSharePayload)('home', '/pages/home/index'); },
    onShareTimeline() { (0, share_1.trackShare)('timeline_share', 'home'); const payload = (0, share_1.getSharePayload)('home', '/pages/home/index'); return { title: payload.title, imageUrl: payload.imageUrl }; },
});

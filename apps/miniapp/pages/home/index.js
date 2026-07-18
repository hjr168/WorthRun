"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const user_1 = require("../../utils/user");
const home_1 = require("../../utils/home");
Page({
    data: {
        loading: true,
        error: '',
        userKey: '',
        preference: null,
        preferenceText: '',
        priorityEvents: [],
        closingEvents: [],
        recentEvents: [],
        fallbackNotice: '',
    },
    onShow() {
        this.load();
    },
    async load() {
        const userKey = (0, user_1.getUserKey)();
        this.setData({ loading: true, error: '', fallbackNotice: '', userKey });
        try {
            const preference = await (0, api_1.getPreference)(userKey).catch(() => null);
            const params = {
                page: 1,
                pageSize: 10,
                city: (preference === null || preference === void 0 ? void 0 : preference.cities[0]) || '',
                distance: (preference === null || preference === void 0 ? void 0 : preference.distances[0]) || '',
            };
            const [eventRes, favoriteRes] = await Promise.all([
                this.getEventsWithFallback(params),
                (0, api_1.getFavorites)(userKey).catch(() => ({ items: [] })),
            ]);
            const favoriteIds = new Set(favoriteRes.items.map((item) => item.eventId));
            const events = eventRes.items.map((item) => (Object.assign(Object.assign({}, item), { isFavorite: favoriteIds.has(item.id) })));
            const preferenceText = preference
                ? `${preference.cities.join('、') || '城市不限'} · ${preference.distances.join('、') || '距离不限'}`
                : '';
            const groups = (0, home_1.groupHomeEvents)(events);
            this.setData(Object.assign(Object.assign({}, groups), { fallbackNotice: eventRes.usedFallback ? '暂未找到完全匹配偏好的赛事，先看看近期赛事。' : '', preference,
                preferenceText, loading: false }));
        }
        catch (error) {
            this.setData({ loading: false, error: error.message || '网络异常' });
            wx.showToast({ title: '网络异常', icon: 'none' });
        }
    },
    reload() {
        this.load();
    },
    async getEventsWithFallback(params) {
        const firstRes = await (0, api_1.getEvents)(params);
        if (firstRes.items.length)
            return Object.assign(Object.assign({}, firstRes), { usedFallback: false });
        if (params.city) {
            const cityRes = await (0, api_1.getEvents)({
                page: params.page,
                pageSize: params.pageSize,
                city: params.city,
            });
            if (cityRes.items.length)
                return Object.assign(Object.assign({}, cityRes), { usedFallback: Boolean(params.distance) });
        }
        const allRes = await (0, api_1.getEvents)({ page: params.page, pageSize: params.pageSize });
        return Object.assign(Object.assign({}, allRes), { usedFallback: Boolean(params.city || params.distance) && allRes.items.length > 0 });
    },
    openPreference() {
        wx.navigateTo({ url: '/pages/preferences/index' });
    },
    openEvents() {
        wx.switchTab({ url: '/pages/events/index' });
    },
    openEvent(event) {
        wx.navigateTo({ url: `/pages/event-detail/index?id=${event.detail.id}` });
    },
    async toggleFavorite(event) {
        const { id, isFavorite } = event.detail;
        try {
            if (isFavorite) {
                await (0, api_1.removeFavorite)(this.data.userKey, id);
                wx.showToast({ title: '已取消收藏', icon: 'success' });
            }
            else {
                await (0, api_1.addFavorite)(this.data.userKey, id);
                wx.showToast({ title: '收藏成功', icon: 'success' });
            }
            this.load();
        }
        catch (_a) {
            wx.showToast({ title: isFavorite ? '取消收藏失败' : '收藏失败', icon: 'none' });
        }
    },
});

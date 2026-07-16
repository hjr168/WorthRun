"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const user_1 = require("../../utils/user");
Page({
    data: {
        loading: true,
        error: '',
        userKey: '',
        events: [],
    },
    onShow() {
        this.load();
    },
    async load() {
        const userKey = (0, user_1.getUserKey)();
        this.setData({ userKey, loading: true, error: '' });
        try {
            const res = await (0, api_1.getFavorites)(userKey);
            this.setData({
                loading: false,
                events: res.items.map((item) => (Object.assign(Object.assign({}, item.event), { sourceReviewPending: Boolean(item.event.sourceReviewPending), isFavorite: true }))),
            });
        }
        catch (error) {
            this.setData({ loading: false, error: error.message || '网络异常' });
        }
    },
    reload() {
        this.load();
    },
    openEvent(event) {
        wx.navigateTo({ url: `/pages/event-detail/index?id=${event.detail.id}` });
    },
    async toggleFavorite(event) {
        try {
            await (0, api_1.removeFavorite)(this.data.userKey, event.detail.id);
            wx.showToast({ title: '已取消收藏', icon: 'success' });
            this.load();
        }
        catch (_a) {
            wx.showToast({ title: '取消收藏失败', icon: 'none' });
        }
    },
    openEvents() {
        wx.switchTab({ url: '/pages/events/index' });
    },
});

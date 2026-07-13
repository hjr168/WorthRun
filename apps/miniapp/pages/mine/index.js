"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const index_1 = require("../../config/index");
const format_1 = require("../../utils/format");
const user_1 = require("../../utils/user");
Page({
    data: {
        loading: true,
        error: '',
        userKey: '',
        shortUserKey: '',
        preference: null,
        preferenceText: '尚未设置偏好',
        nextEvent: null,
        nextEventDate: '',
        complianceNotice: format_1.complianceNotice,
        isDev: index_1.config.env === 'dev',
    },
    onShow() {
        this.load();
    },
    async load() {
        var _a;
        const userKey = (0, user_1.getUserKey)();
        this.setData({ loading: true, error: '', userKey });
        try {
            const [preference, favorites] = await Promise.all([
                (0, api_1.getPreference)(userKey).catch(() => null),
                (0, api_1.getFavorites)(userKey),
            ]);
            const nextEvent = ((_a = favorites.items[0]) === null || _a === void 0 ? void 0 : _a.event) || null;
            const preferenceText = preference
                ? `${preference.cities.join('、') || '城市不限'} · ${preference.distances.join('、') || '距离不限'}`
                : '尚未设置偏好';
            this.setData({
                loading: false,
                userKey,
                shortUserKey: `${userKey.slice(0, 10)}...`,
                preference,
                preferenceText,
                nextEvent,
                nextEventDate: nextEvent ? (0, format_1.formatDate)(nextEvent.eventDate) : '',
                complianceNotice: format_1.complianceNotice,
            });
        }
        catch (error) {
            this.setData({
                loading: false,
                shortUserKey: `${userKey.slice(0, 10)}...`,
                error: error.message || '网络异常',
            });
        }
    },
    reload() {
        this.load();
    },
    openPreferences() {
        wx.navigateTo({ url: '/pages/preferences/index' });
    },
    openFavorites() {
        wx.navigateTo({ url: '/pages/favorites/index' });
    },
    openFeedback() {
        wx.navigateTo({ url: '/pages/feedback/index' });
    },
    openTools() {
        wx.navigateTo({ url: '/pages/tools/index' });
    },
    openNextEvent() {
        if (!this.data.nextEvent)
            return;
        wx.navigateTo({ url: `/pages/event-detail/index?id=${this.data.nextEvent.id}` });
    },
    clearLocalUserData() {
        wx.showModal({
            title: '清除本地用户数据',
            content: '将清除本地匿名标识。重新进入后会生成新的匿名身份，偏好和收藏会按新身份重新开始。',
            confirmText: '清除',
            success: (result) => {
                if (!result.confirm)
                    return;
                (0, user_1.clearUserKey)();
                wx.showToast({ title: '已清除', icon: 'success' });
                this.load();
            },
        });
    },
});

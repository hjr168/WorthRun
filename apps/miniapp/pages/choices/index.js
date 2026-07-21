"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const format_1 = require("../../utils/format");
const user_1 = require("../../utils/user");
const product_feedback_1 = require("../../utils/product-feedback");
const share_1 = require("../../utils/share");
const choiceLabels = {
    interested: '想跑',
    considering: '观望',
    registered: '已报名（用户自报）',
};
Page({
    data: {
        loading: true,
        error: '',
        errorRequestId: '',
        userKey: '',
        filter: '',
        filters: [
            { value: '', label: '全部' },
            { value: 'interested', label: '想跑' },
            { value: 'considering', label: '观望' },
            { value: 'registered', label: '已报名' },
        ],
        items: [],
    },
    onShow() {
        (0, share_1.enableProductShareOnly)();
        this.load();
    },
    async load() {
        const userKey = (0, user_1.getUserKey)();
        this.setData({ userKey, loading: true, error: '', errorRequestId: '' });
        try {
            const result = await (0, api_1.getEventChoices)(userKey, this.data.filter || undefined);
            this.setData({
                loading: false,
                items: result.items.map((item) => (Object.assign(Object.assign({}, item), { choiceText: choiceLabels[item.choice], dateText: item.event ? (0, format_1.formatDate)(item.event.eventDate) : '', distanceText: item.event ? (0, format_1.formatDistance)(item.event.distanceItems) : '' }))),
            });
        }
        catch (error) {
            this.setData({
                loading: false,
                error: error.message || '网络异常',
                errorRequestId: error instanceof api_1.ApiError ? error.requestId || '' : '',
            });
        }
    },
    changeFilter(event) {
        this.setData({ filter: String(event.currentTarget.dataset.value || '') });
        this.load();
    },
    openEvent(event) {
        const eventId = String(event.currentTarget.dataset.id || '');
        if (eventId)
            wx.navigateTo({ url: `/pages/event-detail/index?id=${eventId}` });
    },
    removeChoice(event) {
        const eventId = String(event.currentTarget.dataset.id || '');
        if (!eventId)
            return;
        wx.showModal({
            title: '清除这条选择？',
            content: '清除后赛事详情中的匿名数量会同步更新。',
            confirmText: '清除',
            success: async (result) => {
                if (!result.confirm)
                    return;
                try {
                    await (0, api_1.removeEventChoice)(this.data.userKey, eventId);
                    wx.showToast({ title: '已清除', icon: 'success' });
                    await this.load();
                }
                catch (error) {
                    wx.showToast({ title: error.message || '清除失败', icon: 'none' });
                }
            },
        });
    },
    reload() {
        this.load();
    },
    reportProblem() {
        (0, product_feedback_1.openProductFeedback)('choices', this.data.errorRequestId || undefined);
    },
    openEvents() {
        wx.switchTab({ url: '/pages/events/index' });
    },
    onShareAppMessage() {
        return (0, share_1.getProductHomeShare)();
    },
});

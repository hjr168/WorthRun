"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const account_1 = require("../../utils/account");
const format_1 = require("../../utils/format");
Page({
    data: {
        loading: true,
        error: '',
        items: [],
    },
    onShow() {
        this.load();
    },
    async load() {
        this.setData({ loading: true, error: '' });
        try {
            await (0, account_1.ensureWechatSession)(true);
            const result = await (0, api_1.getMyReminders)();
            this.setData({
                items: result.items.map((item) => (Object.assign(Object.assign({}, item), { dateText: (0, format_1.formatDate)(item.event.eventDate), scheduleText: item.scheduledAt ? (0, format_1.formatDateTime)(item.scheduledAt) : '待官方核验报名开放', typeText: item.reminderType === 'signup' ? '报名提醒' : '赛前 7 天提醒' }))),
            });
        }
        catch (error) {
            this.setData({ error: error.message || '提醒加载失败' });
        }
        finally {
            this.setData({ loading: false });
        }
    },
    cancel(event) {
        const eventId = String(event.currentTarget.dataset.eventId || '');
        const type = String(event.currentTarget.dataset.type || '');
        wx.showModal({
            title: '取消这条提醒？',
            confirmText: '取消提醒',
            success: async (result) => {
                if (!result.confirm)
                    return;
                try {
                    await (0, api_1.cancelEventReminder)(eventId, type);
                    await this.load();
                }
                catch (error) {
                    wx.showToast({ title: error.message || '取消失败', icon: 'none' });
                }
            },
        });
    },
    openEvent(event) {
        wx.navigateTo({ url: `/pages/event-detail/index?id=${event.currentTarget.dataset.eventId}` });
    },
});

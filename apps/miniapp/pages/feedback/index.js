"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const user_1 = require("../../utils/user");
const feedbackTypes = [
    '日期有误',
    '报名状态有误',
    '官方链接失效',
    '赛事取消 / 延期',
    '信息重复',
    '其他',
];
function createFeedbackRequestId() {
    const random = Math.random().toString(36).slice(2, 12);
    return `feedback_${Date.now().toString(36)}_${random}`;
}
Page({
    data: {
        eventId: '',
        userKey: '',
        requestId: '',
        hasEvent: false,
        feedbackTypes,
        typeIndex: 0,
        content: '',
        submitting: false,
    },
    onLoad(query) {
        const eventId = query.eventId || '';
        this.setData({ eventId, userKey: (0, user_1.getUserKey)(), hasEvent: Boolean(eventId) });
    },
    onTypeChange(event) {
        this.setData({ typeIndex: Number(event.detail.value) });
    },
    onContentInput(event) {
        this.setData({ content: event.detail.value });
    },
    goEvents() {
        wx.switchTab({ url: '/pages/events/index' });
    },
    async submit() {
        if (this.data.submitting)
            return;
        if (!this.data.eventId) {
            wx.showToast({ title: '赛事不存在', icon: 'none' });
            return;
        }
        const content = this.data.content.trim() || feedbackTypes[this.data.typeIndex];
        const requestId = this.data.requestId || createFeedbackRequestId();
        this.setData({ submitting: true, requestId });
        try {
            const result = await (0, api_1.submitFeedback)({
                eventId: this.data.eventId,
                userKey: this.data.userKey,
                requestId,
                feedbackType: feedbackTypes[this.data.typeIndex],
                content,
            });
            wx.showToast({ title: result.duplicate ? '相同反馈已收到' : '提交成功', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 600);
        }
        catch (error) {
            if (error instanceof api_1.ApiError && error.statusCode === 429) {
                const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds || 60) / 60));
                wx.showToast({ title: `提交过于频繁，请约 ${minutes} 分钟后再试`, icon: 'none' });
            }
            else {
                wx.showToast({ title: error.message || '反馈失败', icon: 'none' });
            }
        }
        finally {
            this.setData({ submitting: false });
        }
    },
});

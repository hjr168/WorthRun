"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const feedback_1 = require("../../utils/feedback");
const format_1 = require("../../utils/format");
const user_1 = require("../../utils/user");
const feedbackTypes = [
    '日期有误',
    '报名状态有误',
    '官方链接失效',
    '赛事取消 / 延期',
    '信息重复',
    '其他',
];
const feedbackHints = [
    '请填写你看到的正确日期或信息出处',
    '请说明官网当前显示的报名状态',
    '请说明链接打开后的情况或新的官方入口',
    '请说明取消、延期信息及其官方出处',
    '请填写重复赛事的名称或页面信息',
    '请具体说明需要核对的问题',
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
        eventLoading: false,
        eventError: '',
        event: null,
        eventDateText: '',
        feedbackTypes,
        feedbackHints,
        typeIndex: 0,
        content: '',
        contentLength: 0,
        canSubmit: false,
        submitting: false,
        submitted: false,
        successMessage: '反馈已收到',
    },
    onLoad(query) {
        const eventId = query.eventId || '';
        this.setData({ eventId, userKey: (0, user_1.getUserKey)(), hasEvent: Boolean(eventId) });
        if (eventId)
            this.loadEvent();
    },
    async loadEvent() {
        this.setData({ eventLoading: true, eventError: '' });
        try {
            const result = await (0, api_1.getEventDetail)(this.data.eventId);
            this.setData({
                event: result.event,
                eventDateText: (0, format_1.formatDate)(result.event.eventDate),
                eventLoading: false,
            });
        }
        catch (error) {
            this.setData({
                eventLoading: false,
                eventError: error.message || '赛事信息加载失败',
            });
        }
    },
    onTypeSelect(event) {
        this.setData({ typeIndex: Number(event.currentTarget.dataset.index) });
    },
    onContentInput(event) {
        const content = event.detail.value;
        const contentLength = content.trim().length;
        this.setData({ content, contentLength, canSubmit: contentLength >= 6 && contentLength <= 500 });
    },
    goEvents() {
        wx.switchTab({ url: '/pages/events/index' });
    },
    backToEvent() {
        wx.redirectTo({ url: `/pages/event-detail/index?id=${this.data.eventId}` });
    },
    async submit() {
        if (this.data.submitting || !this.data.canSubmit || !this.data.event)
            return;
        const content = this.data.content.trim();
        const requestId = this.data.requestId || createFeedbackRequestId();
        this.setData({ submitting: true, requestId });
        try {
            const feedbackType = feedbackTypes[this.data.typeIndex];
            const result = await (0, api_1.submitFeedback)({
                eventId: this.data.eventId,
                userKey: this.data.userKey,
                requestId,
                feedbackType,
                content,
            });
            (0, feedback_1.saveFeedbackReceipt)({
                eventId: this.data.eventId,
                eventName: this.data.event.eventName,
                feedbackType,
                createdAt: new Date().toISOString(),
                requestId,
            });
            this.setData({
                submitted: true,
                successMessage: result.duplicate ? '相同反馈已收到' : '反馈已收到',
            });
        }
        catch (error) {
            if (error instanceof api_1.ApiError && error.statusCode === 429) {
                const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds || 60) / 60));
                wx.showToast({ title: `提交过于频繁，请约 ${minutes} 分钟后再试`, icon: 'none' });
            }
            else if (error instanceof api_1.ApiError && error.statusCode === 400) {
                wx.showToast({ title: error.message || '请修改反馈内容后重试', icon: 'none' });
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

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const feedback_1 = require("../../utils/feedback");
const product_feedback_1 = require("../../utils/product-feedback");
const user_1 = require("../../utils/user");
const feedbackTypes = ['功能建议', '使用问题', '页面异常', '内容体验', '其他'];
const feedbackHints = [
    '请说明你希望增加或调整的功能',
    '请说明操作步骤和遇到的具体问题',
    '请说明哪个页面显示异常以及当时的操作',
    '请说明哪些内容不清楚、不准确或不方便阅读',
    '请具体说明你的意见或建议',
];
const contextLabels = {
    home: '首页',
    events: '赛事列表',
    event_detail: '赛事详情',
    source_summary: '来源摘要',
    favorites: '我的收藏',
    choices: '我的选择',
    mine: '我的',
};
const customContextValue = '__custom__';
const contextOptions = [
    ...product_feedback_1.productFeedbackContexts.map((value) => ({ value, label: contextLabels[value] })),
    { value: customContextValue, label: '自定义' },
];
const customContextIndex = contextOptions.length - 1;
Page({
    data: {
        userKey: '',
        requestId: '',
        contextPage: 'mine',
        contextLabel: '我的',
        contextIndex: product_feedback_1.productFeedbackContexts.indexOf('mine'),
        contextOptions,
        customContextPage: '',
        isCustomContext: false,
        relatedRequestId: '',
        appVersion: '',
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
        const context = (0, product_feedback_1.resolveProductFeedbackContext)(query.contextPage);
        const relatedRequestId = /^[0-9a-f-]{36}$/i.test(query.relatedRequestId || '')
            ? String(query.relatedRequestId)
            : '';
        this.setData({
            userKey: (0, user_1.getUserKey)(),
            contextPage: context.contextPage,
            contextLabel: context.isCustomContext ? '自定义' : contextLabels[context.contextPage],
            contextIndex: context.isCustomContext
                ? customContextIndex
                : product_feedback_1.productFeedbackContexts.indexOf(context.contextPage),
            customContextPage: context.customContextPage,
            isCustomContext: context.isCustomContext,
            relatedRequestId,
            appVersion: (0, product_feedback_1.getMiniappVersion)() || '',
        });
    },
    onTypeSelect(event) {
        this.setData({ typeIndex: Number(event.currentTarget.dataset.index) });
    },
    onContextSelect(event) {
        const contextIndex = Number(event.detail.value);
        const option = contextOptions[contextIndex];
        if (!option)
            return;
        const isCustomContext = option.value === customContextValue;
        const customContextPage = isCustomContext ? this.data.customContextPage : '';
        this.setData({
            contextIndex,
            contextPage: isCustomContext ? this.data.contextPage : option.value,
            contextLabel: option.label,
            customContextPage,
            isCustomContext,
            canSubmit: (0, product_feedback_1.canSubmitProductFeedback)(this.data.contentLength, isCustomContext, customContextPage),
        });
    },
    onContextInput(event) {
        const customContextPage = event.detail.value;
        this.setData({
            customContextPage,
            isCustomContext: true,
            contextIndex: customContextIndex,
            contextLabel: '自定义',
            canSubmit: (0, product_feedback_1.canSubmitProductFeedback)(this.data.contentLength, true, customContextPage),
        });
    },
    onContentInput(event) {
        const content = event.detail.value;
        const contentLength = content.trim().length;
        this.setData({
            content,
            contentLength,
            canSubmit: (0, product_feedback_1.canSubmitProductFeedback)(contentLength, this.data.isCustomContext, this.data.customContextPage),
        });
    },
    goBack() {
        wx.navigateBack({ delta: 1 });
    },
    async submit() {
        if (this.data.submitting || !this.data.canSubmit)
            return;
        const requestId = this.data.requestId || (0, feedback_1.createFeedbackRequestId)();
        const feedbackType = feedbackTypes[this.data.typeIndex];
        const contextPage = this.data.isCustomContext
            ? this.data.customContextPage.trim()
            : this.data.contextPage;
        this.setData({ submitting: true, requestId });
        try {
            const result = await (0, api_1.submitProductFeedback)({
                userKey: this.data.userKey,
                requestId,
                feedbackType,
                content: this.data.content.trim(),
                contextPage,
                appVersion: this.data.appVersion || undefined,
                relatedRequestId: this.data.relatedRequestId || undefined,
            });
            (0, feedback_1.saveFeedbackReceipt)({
                scope: 'product_feedback',
                feedbackType,
                contextPage,
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

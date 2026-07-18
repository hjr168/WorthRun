"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const format_1 = require("../../utils/format");
const user_1 = require("../../utils/user");
const product_feedback_1 = require("../../utils/product-feedback");
Page({
    data: {
        eventId: '',
        userKey: '',
        loading: true,
        error: '',
        errorRequestId: '',
        item: null,
        eventDateText: '',
        fetchedAtText: '',
        basisText: '',
        complianceNotice: format_1.complianceNotice,
    },
    onLoad(query) {
        this.setData({ eventId: query.eventId || '', userKey: (0, user_1.getUserKey)() });
        this.load();
    },
    async load() {
        if (!this.data.eventId) {
            this.setData({ loading: false, error: '缺少赛事信息' });
            return;
        }
        this.setData({ loading: true, error: '', errorRequestId: '' });
        try {
            const item = await (0, api_1.getSourceSummary)(this.data.eventId);
            this.setData({
                item,
                eventDateText: (0, format_1.formatDate)(item.event.eventDate),
                fetchedAtText: (0, format_1.formatDateTime)(item.fetchedAt),
                basisText: item.basis === 'page_text' ? '来源页面正文' : '已保存来源记录',
                complianceNotice: item.complianceNotice || format_1.complianceNotice,
                loading: false,
            });
            (0, api_1.recordInteraction)({
                userKey: this.data.userKey,
                eventId: this.data.eventId,
                action: 'source_summary_view',
            }).catch(() => { });
        }
        catch (error) {
            this.setData({
                loading: false,
                item: null,
                error: error.message || '来源摘要加载失败',
                errorRequestId: error instanceof api_1.ApiError ? error.requestId || '' : '',
            });
        }
    },
    reload() {
        this.load();
    },
    reportProblem() {
        (0, product_feedback_1.openProductFeedback)('source_summary', this.data.errorRequestId || undefined);
    },
    copySourceUrl() {
        var _a;
        if (!((_a = this.data.item) === null || _a === void 0 ? void 0 : _a.sourceUrl))
            return;
        wx.setClipboardData({
            data: this.data.item.sourceUrl,
            success: () => {
                (0, api_1.recordInteraction)({
                    userKey: this.data.userKey,
                    eventId: this.data.eventId,
                    action: 'source_original_link_copy',
                }).catch(() => { });
                wx.showModal({
                    title: '来源链接已复制',
                    content: '请在浏览器或微信中打开，并以来源原文为准。',
                    showCancel: false,
                    confirmText: '知道了',
                });
            },
            fail: () => wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' }),
        });
    },
    backToEvent() {
        wx.navigateBack({
            fail: () => wx.redirectTo({ url: `/pages/event-detail/index?id=${this.data.eventId}` }),
        });
    },
});

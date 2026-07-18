"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const format_1 = require("../../utils/format");
const user_1 = require("../../utils/user");
const launch_1 = require("../../utils/launch");
const feedback_1 = require("../../utils/feedback");
const event_detail_1 = require("../../utils/event-detail");
const product_feedback_1 = require("../../utils/product-feedback");
Page({
    data: {
        id: '',
        userKey: '',
        loading: true,
        error: '',
        errorRequestId: '',
        event: null,
        isFavorite: false,
        viewerChoice: null,
        choiceUpdating: false,
        dateText: '',
        distanceText: '',
        sourceCheckedAtText: '等待复核',
        updatedAtText: '待确认',
        eventNotice: null,
        hasChoiceCounts: false,
        aiExpanded: false,
        infoStatusText: '待核实',
        confirmedItems: [],
        pendingItems: [],
        hasVerificationItems: false,
        hasFeedbackReceipt: false,
        complianceNotice: format_1.complianceNotice,
        officialActionText: format_1.officialActionText,
    },
    onLoad(query) {
        this.setData({ id: (0, launch_1.resolveEventId)(query), userKey: (0, user_1.getUserKey)() });
        this.load();
    },
    onShow() {
        this.refreshFeedbackReceipt();
    },
    refreshFeedbackReceipt() {
        if (!this.data.id)
            return;
        this.setData({
            hasFeedbackReceipt: (0, feedback_1.getFeedbackReceipts)().some((item) => item.eventId === this.data.id),
        });
    },
    async load() {
        if (!this.data.id) {
            this.setData({ loading: false, error: '赛事不存在或未发布' });
            return;
        }
        this.setData({ loading: true, error: '', errorRequestId: '' });
        try {
            const [detail, favorites, viewerChoice] = await Promise.all([
                (0, api_1.getEventDetail)(this.data.id),
                (0, api_1.getFavorites)(this.data.userKey).catch(() => ({ items: [] })),
                (0, api_1.getEventChoice)(this.data.userKey, this.data.id).catch(() => ({ choice: null })),
            ]);
            const verification = (0, event_detail_1.buildVerificationGroups)(detail.event.infoStatus, detail.event.checklistItems);
            this.setData({
                event: detail.event,
                isFavorite: favorites.items.some((item) => item.eventId === this.data.id),
                viewerChoice: viewerChoice.choice,
                dateText: (0, format_1.formatDate)(detail.event.eventDate),
                distanceText: (0, format_1.formatDistance)(detail.event.distanceItems),
                sourceCheckedAtText: detail.event.sourceCheckedAt
                    ? (0, format_1.formatDateTime)(detail.event.sourceCheckedAt)
                    : '等待复核',
                updatedAtText: detail.event.updatedAt
                    ? (0, format_1.formatDateTime)(detail.event.updatedAt)
                    : '待确认',
                eventNotice: (0, event_detail_1.getEventNotice)(detail.event),
                hasChoiceCounts: (0, event_detail_1.hasChoiceCounts)(detail.event.choiceCounts),
                infoStatusText: (0, format_1.labelOf)(format_1.infoStatusLabels, detail.event.infoStatus),
                confirmedItems: verification.confirmedItems,
                pendingItems: verification.pendingItems,
                hasVerificationItems: verification.hasItemRecords,
                complianceNotice: detail.complianceNotice || format_1.complianceNotice,
                officialActionText: detail.officialActionText || format_1.officialActionText,
                loading: false,
            });
            this.refreshFeedbackReceipt();
            (0, api_1.recordInteraction)({
                userKey: this.data.userKey,
                eventId: detail.event.id,
                action: 'event_detail_view',
            }).catch(() => { });
        }
        catch (error) {
            this.setData({
                loading: false,
                event: null,
                error: error.message || '赛事不存在或未发布',
                errorRequestId: error instanceof api_1.ApiError ? error.requestId || '' : '',
            });
        }
    },
    reload() {
        this.load();
    },
    reportProblem() {
        (0, product_feedback_1.openProductFeedback)('event_detail', this.data.errorRequestId || undefined);
    },
    async toggleFavorite() {
        if (!this.data.event)
            return;
        try {
            if (this.data.isFavorite) {
                await (0, api_1.removeFavorite)(this.data.userKey, this.data.event.id);
                wx.showToast({ title: '已取消收藏', icon: 'success' });
            }
            else {
                await (0, api_1.addFavorite)(this.data.userKey, this.data.event.id);
                wx.showToast({ title: '收藏成功', icon: 'success' });
            }
            this.setData({ isFavorite: !this.data.isFavorite });
        }
        catch (_a) { }
    },
    onChoiceTap(event) {
        if (this.data.choiceUpdating)
            return;
        const choice = String(event.currentTarget.dataset.choice || '');
        if (!['interested', 'considering', 'registered'].includes(choice))
            return;
        if (this.data.viewerChoice === choice) {
            wx.showModal({
                title: '清除我的选择？',
                content: '清除后公开数量会同步更新。',
                confirmText: '清除',
                success: (result) => {
                    if (result.confirm)
                        this.clearChoice();
                },
            });
            return;
        }
        this.saveChoice(choice);
    },
    async saveChoice(choice) {
        if (!this.data.event || this.data.choiceUpdating)
            return;
        const previousChoice = this.data.viewerChoice;
        const previousCounts = Object.assign({}, this.data.event.choiceCounts);
        const optimisticCounts = (0, event_detail_1.updateChoiceCounts)(previousCounts, previousChoice, choice);
        this.setData({
            choiceUpdating: true,
            viewerChoice: choice,
            'event.choiceCounts': optimisticCounts,
            hasChoiceCounts: (0, event_detail_1.hasChoiceCounts)(optimisticCounts),
        });
        try {
            const result = await (0, api_1.setEventChoice)(this.data.userKey, this.data.event.id, choice);
            this.setData({
                viewerChoice: result.choice,
                'event.choiceCounts': result.choiceCounts,
                hasChoiceCounts: (0, event_detail_1.hasChoiceCounts)(result.choiceCounts),
            });
            wx.showToast({ title: '选择已更新', icon: 'success' });
        }
        catch (error) {
            this.setData({
                viewerChoice: previousChoice,
                'event.choiceCounts': previousCounts,
                hasChoiceCounts: (0, event_detail_1.hasChoiceCounts)(previousCounts),
            });
            wx.showToast({ title: error.message || '更新失败', icon: 'none' });
        }
        finally {
            this.setData({ choiceUpdating: false });
        }
    },
    async clearChoice() {
        if (!this.data.event || this.data.choiceUpdating)
            return;
        const previousChoice = this.data.viewerChoice;
        const previousCounts = Object.assign({}, this.data.event.choiceCounts);
        const optimisticCounts = (0, event_detail_1.updateChoiceCounts)(previousCounts, previousChoice, null);
        this.setData({
            choiceUpdating: true,
            viewerChoice: null,
            'event.choiceCounts': optimisticCounts,
            hasChoiceCounts: (0, event_detail_1.hasChoiceCounts)(optimisticCounts),
        });
        try {
            const result = await (0, api_1.removeEventChoice)(this.data.userKey, this.data.event.id);
            this.setData({
                viewerChoice: null,
                'event.choiceCounts': result.choiceCounts,
                hasChoiceCounts: (0, event_detail_1.hasChoiceCounts)(result.choiceCounts),
            });
            wx.showToast({ title: '已清除', icon: 'success' });
        }
        catch (error) {
            this.setData({
                viewerChoice: previousChoice,
                'event.choiceCounts': previousCounts,
                hasChoiceCounts: (0, event_detail_1.hasChoiceCounts)(previousCounts),
            });
            wx.showToast({ title: error.message || '清除失败', icon: 'none' });
        }
        finally {
            this.setData({ choiceUpdating: false });
        }
    },
    openOfficial() {
        var _a;
        const url = (_a = this.data.event) === null || _a === void 0 ? void 0 : _a.officialUrl;
        if (!url) {
            wx.showToast({ title: '请前往官方渠道确认', icon: 'none' });
            return;
        }
        wx.setClipboardData({
            data: url,
            success: () => {
                (0, api_1.recordInteraction)({
                    userKey: this.data.userKey,
                    eventId: this.data.id,
                    action: 'official_link_copy',
                }).catch(() => { });
                wx.showModal({
                    title: '官方链接已复制',
                    content: '小程序暂不直接跳转外部链接，已为你复制官方链接。请在浏览器或微信中打开后，以官方信息为准。',
                    showCancel: false,
                    confirmText: '知道了',
                });
            },
            fail: () => wx.showToast({ title: '请前往官方渠道确认', icon: 'none' }),
        });
    },
    openFeedback() {
        wx.navigateTo({ url: `/pages/feedback/index?eventId=${this.data.id}` });
    },
    toggleAiNotice() {
        this.setData({ aiExpanded: !this.data.aiExpanded });
    },
    openSourceSummary() {
        var _a;
        if (!((_a = this.data.event) === null || _a === void 0 ? void 0 : _a.hasSourceSummary))
            return;
        (0, api_1.recordInteraction)({
            userKey: this.data.userKey,
            eventId: this.data.id,
            action: 'source_summary_open',
        }).catch(() => { });
        wx.navigateTo({ url: `/pages/source-summary/index?eventId=${this.data.id}` });
    },
    openShareCard() {
        if (!this.data.event)
            return;
        wx.navigateTo({ url: `/pages/share-card/index?id=${this.data.id}` });
    },
    onShareAppMessage() {
        const event = this.data.event;
        if (event) {
            (0, api_1.recordShare)({
                userKey: this.data.userKey,
                eventId: event.id,
                shareType: 'page_share',
                scene: 'event_detail',
            }).catch(() => { });
        }
        return {
            title: event ? `这场值得跑吗？${event.eventName}` : '哪场值得跑｜大湾区跑步赛事决策工具',
            path: event ? `/pages/event-detail/index?id=${event.id}` : '/pages/home/index',
        };
    },
    onShareTimeline() {
        const event = this.data.event;
        return {
            title: event ? `这场值得跑吗？${event.eventName}` : '哪场值得跑',
            query: event ? `id=${event.id}` : '',
        };
    },
});

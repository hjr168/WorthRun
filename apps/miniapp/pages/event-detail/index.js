"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const format_1 = require("../../utils/format");
const user_1 = require("../../utils/user");
const launch_1 = require("../../utils/launch");
const feedback_1 = require("../../utils/feedback");
const event_detail_1 = require("../../utils/event-detail");
const product_feedback_1 = require("../../utils/product-feedback");
const share_1 = require("../../utils/share");
const account_1 = require("../../utils/account");
const index_1 = require("../../config/index");
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
        reminderUpdating: '',
        reminderSubscribed: { signup: false, race_week: false },
    },
    onLoad(query) {
        (0, share_1.enablePublicShare)();
        this.setData({ id: (0, launch_1.resolveEventId)(query), userKey: (0, user_1.getUserKey)() });
        this.load();
        if (query.shareToken) {
            (0, account_1.ensureWechatSession)()
                .then((profile) => profile
                ? (0, api_1.recordActivity)({
                    entryPage: 'event_detail',
                    channel: 'share',
                    referralShareToken: query.shareToken,
                })
                : undefined)
                .catch(() => { });
        }
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
            const [detail, favorites, viewerChoice, reminderResult] = await Promise.all([
                (0, api_1.getEventDetail)(this.data.id),
                (0, api_1.getFavorites)(this.data.userKey).catch(() => ({ items: [] })),
                (0, api_1.getEventChoice)(this.data.userKey, this.data.id).catch(() => ({ choice: null })),
                (0, api_1.getMyReminders)().catch(() => ({ items: [] })),
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
                updatedAtText: detail.event.updatedAt ? (0, format_1.formatDateTime)(detail.event.updatedAt) : '待确认',
                eventNotice: (0, event_detail_1.getEventNotice)(detail.event),
                hasChoiceCounts: (0, event_detail_1.hasChoiceCounts)(detail.event.choiceCounts),
                infoStatusText: (0, format_1.labelOf)(format_1.infoStatusLabels, detail.event.infoStatus),
                confirmedItems: verification.confirmedItems,
                pendingItems: verification.pendingItems,
                hasVerificationItems: verification.hasItemRecords,
                complianceNotice: detail.complianceNotice || format_1.complianceNotice,
                officialActionText: detail.officialActionText || format_1.officialActionText,
                reminderSubscribed: {
                    signup: reminderResult.items.some((item) => item.eventId === detail.event.id && item.reminderType === 'signup'),
                    race_week: reminderResult.items.some((item) => item.eventId === detail.event.id && item.reminderType === 'race_week'),
                },
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
    async subscribeReminder(event) {
        var _a;
        const type = String(event.currentTarget.dataset.type || '');
        if (!this.data.event || this.data.reminderUpdating || this.data.reminderSubscribed[type])
            return;
        const option = (_a = this.data.event.reminderOptions) === null || _a === void 0 ? void 0 : _a.find((item) => item.type === type);
        if (!(option === null || option === void 0 ? void 0 : option.available)) {
            wx.showToast({ title: (option === null || option === void 0 ? void 0 : option.reason) || '当前暂无可用提醒', icon: 'none' });
            return;
        }
        const templateId = index_1.config.reminderTemplateIds[type];
        if (!templateId) {
            wx.showToast({ title: '提醒功能正在灰度开放', icon: 'none' });
            return;
        }
        this.setData({ reminderUpdating: type });
        try {
            const profile = await (0, account_1.ensureWechatSession)(true);
            if (!profile)
                throw new Error('请稍后重试微信登录');
            const permission = await new Promise((resolve, reject) => {
                wx.requestSubscribeMessage({ tmplIds: [templateId], success: resolve, fail: reject });
            });
            if (permission[templateId] !== 'accept')
                throw new Error('需先允许本次消息提醒');
            await (0, api_1.subscribeEventReminders)(this.data.event.id, [type]);
            this.setData({ [`reminderSubscribed.${type}`]: true });
            wx.showToast({ title: '提醒已开启', icon: 'success' });
        }
        catch (error) {
            wx.showToast({ title: error.message || '开启提醒失败', icon: 'none' });
        }
        finally {
            this.setData({ reminderUpdating: '' });
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
    async onShareAppMessage() {
        const event = this.data.event;
        const tracked = await (0, share_1.trackShare)('page_share', 'event_detail', event === null || event === void 0 ? void 0 : event.id, true);
        if (!event)
            return (0, share_1.getSharePayload)('home', '/pages/home/index');
        return (0, share_1.getSharePayload)('event_detail', `/pages/event-detail/index?id=${event.id}${tracked.shareToken ? `&shareToken=${tracked.shareToken}` : ''}`, {
            eventName: event.eventName,
            city: event.city,
            eventDate: event.eventDate,
            distance: event.distanceItems.join('、'),
            judgement: event.runJudgement,
        }, event.resolvedShare);
    },
    onShareTimeline() {
        const event = this.data.event;
        (0, share_1.trackShare)('timeline_share', 'event_detail', event === null || event === void 0 ? void 0 : event.id);
        const payload = event
            ? (0, share_1.getSharePayload)('event_detail', `/pages/event-detail/index?id=${event.id}`, {
                eventName: event.eventName,
                city: event.city,
                eventDate: event.eventDate,
                distance: event.distanceItems.join('、'),
                judgement: event.runJudgement,
            }, event.resolvedShare)
            : (0, share_1.getSharePayload)('home', '/pages/home/index');
        return {
            title: payload.title,
            query: event ? `id=${event.id}` : '',
            imageUrl: payload.imageUrl,
        };
    },
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const format_1 = require("../../utils/format");
const release_notes_1 = require("../../utils/release-notes");
const share_1 = require("../../utils/share");
const product_feedback_1 = require("../../utils/product-feedback");
const categoryLabels = { feature: '新功能', improvement: '体验优化', fix: '问题修复' };
Page({
    data: {
        loading: true,
        loadingMore: false,
        error: '',
        errorRequestId: '',
        items: [],
        nextCursor: '',
        hasMore: false,
        latestVersion: '',
    },
    onLoad() {
        (0, share_1.enablePublicShare)();
        this.load(true);
    },
    async load(reset = false) {
        var _a, _b;
        if (!reset && (this.data.loadingMore || !this.data.hasMore))
            return;
        this.setData({ loading: reset, loadingMore: !reset, error: '', errorRequestId: '' });
        try {
            const [result, latest] = await Promise.all([
                (0, api_1.getReleaseNotes)(reset ? undefined : this.data.nextCursor, 10),
                reset
                    ? (0, api_1.getLatestReleaseNote)().catch(() => ({ item: null }))
                    : Promise.resolve({ item: null }),
            ]);
            const mapped = result.items.map((item) => (Object.assign(Object.assign({}, item), { releasedAtText: (0, format_1.formatDateTime)(item.releasedAt), displayChanges: item.changes.map((change) => (Object.assign(Object.assign({}, change), { categoryLabel: categoryLabels[change.category] }))) })));
            const items = reset ? mapped : [...this.data.items, ...mapped];
            const latestVersion = ((_a = items[0]) === null || _a === void 0 ? void 0 : _a.version) || '';
            this.setData({
                items,
                loading: false,
                loadingMore: false,
                nextCursor: result.nextCursor || '',
                hasMore: Boolean(result.nextCursor),
                latestVersion,
            });
            if (reset && ((_b = latest.item) === null || _b === void 0 ? void 0 : _b.id))
                (0, release_notes_1.markReleaseRead)(latest.item.id);
        }
        catch (error) {
            this.setData({
                loading: false,
                loadingMore: false,
                error: error.message || '更新日志加载失败',
                errorRequestId: error instanceof api_1.ApiError ? error.requestId || '' : '',
            });
        }
    },
    loadMore() {
        this.load(false);
    },
    reload() {
        this.load(true);
    },
    reportProblem() {
        (0, product_feedback_1.openProductFeedback)('mine', this.data.errorRequestId || undefined);
    },
    onShareAppMessage() {
        (0, share_1.trackShare)('page_share', 'release_notes');
        return (0, share_1.getSharePayload)('release_notes', '/pages/release-notes/index', {
            latestVersion: this.data.latestVersion || '最新版',
        });
    },
    onShareTimeline() {
        (0, share_1.trackShare)('timeline_share', 'release_notes');
        const payload = (0, share_1.getSharePayload)('release_notes', '/pages/release-notes/index', {
            latestVersion: this.data.latestVersion || '最新版',
        });
        return { title: payload.title, imageUrl: payload.imageUrl };
    },
});

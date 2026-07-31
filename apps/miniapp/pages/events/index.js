"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const user_1 = require("../../utils/user");
const product_feedback_1 = require("../../utils/product-feedback");
const share_1 = require("../../utils/share");
const cities = [
    '全部',
    '北京', '上海',
    '南京', '无锡', '徐州', '常州', '苏州', '南通', '连云港', '淮安', '盐城', '扬州', '镇江', '泰州', '宿迁',
    '杭州', '宁波', '温州', '嘉兴', '湖州', '绍兴', '金华', '衢州', '舟山', '台州', '丽水',
    '广州',
    '深圳',
    '珠海',
    '佛山',
    '惠州',
    '东莞',
    '中山',
    '江门',
    '肇庆',
    '汕头', '湛江', '茂名', '梅州', '汕尾', '河源', '阳江', '清远', '潮州', '揭阳', '云浮',
    '成都', '自贡', '攀枝花', '泸州', '德阳', '绵阳', '广元', '遂宁', '内江', '乐山', '南充', '眉山', '宜宾', '广安', '达州', '雅安', '巴中', '资阳', '阿坝', '甘孜', '凉山',
    '重庆', '武汉', '黄石', '十堰', '宜昌', '襄阳', '鄂州', '荆门', '孝感', '荆州', '黄冈', '咸宁', '随州', '恩施', '神农架',
    '福州', '厦门', '莆田', '三明', '泉州', '漳州', '南平', '龙岩', '宁德',
    '香港',
    '澳门',
];
const months = ['全部月份', ...Array.from({ length: 12 }, (_, index) => {
        const date = new Date();
        date.setMonth(date.getMonth() + index);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    })];
const distances = ['全部', '5K', '10K', '半马', '全马', '欢乐跑'];
const signupOptions = [
    { label: '全部', value: '' },
    { label: '报名中', value: 'signup_open' },
    { label: '即将截止', value: 'closing_soon' },
    { label: '即将开放', value: 'not_started' },
    { label: '报名已截止', value: 'closed' },
    { label: '待确认', value: 'unknown' },
];
const judgementOptions = [
    { label: '全部', value: '' },
    { label: '优先关注', value: 'priority' },
    { label: '可以观望', value: 'watch' },
    { label: '待核实', value: 'unverified' },
];
Page({
    data: {
        loading: true,
        error: '',
        errorRequestId: '',
        userKey: '',
        search: '',
        cityIndex: 0,
        distanceIndex: 0,
        signupIndex: 0,
        judgementIndex: 0,
        monthIndex: 0,
        filtersExpanded: false,
        cities,
        distances,
        signupLabels: signupOptions.map((item) => item.label),
        judgementLabels: judgementOptions.map((item) => item.label),
        months,
        events: [],
        page: 1,
        pageSize: 10,
        total: 0,
        hasMore: true,
        loadingMore: false,
        didInitialLoad: false,
        activeFilterText: '全部未来赛事',
        resultText: '',
        searchFocused: false,
        hasActiveFilter: false,
    },
    onLoad() {
        (0, share_1.enablePublicShare)();
        this.load(true);
    },
    onShow() {
        if (wx.getStorageSync('worthrun_focus_event_search')) {
            wx.removeStorageSync('worthrun_focus_event_search');
            this.setData({ searchFocused: true });
            setTimeout(() => this.setData({ searchFocused: false }), 500);
        }
        if (!this.data.didInitialLoad)
            return;
        this.load(true);
    },
    async load(reset = false) {
        const userKey = (0, user_1.getUserKey)();
        if (!reset && (this.data.loadingMore || !this.data.hasMore))
            return;
        const page = reset ? 1 : this.data.page + 1;
        this.setData(Object.assign({ loading: reset, loadingMore: !reset, error: '', errorRequestId: '', userKey,
            page }, (reset ? { events: [], hasMore: true, total: 0 } : {})));
        try {
            const params = {
                page,
                pageSize: this.data.pageSize,
                search: this.data.search,
                city: this.data.cityIndex ? cities[this.data.cityIndex] : '',
                distance: this.data.distanceIndex ? distances[this.data.distanceIndex] : '',
                signupStatus: signupOptions[this.data.signupIndex].value,
                runJudgement: judgementOptions[this.data.judgementIndex].value,
                month: this.data.monthIndex ? months[this.data.monthIndex] : '',
            };
            const activeFilters = [
                this.data.search.trim() ? `搜索：${this.data.search.trim()}` : '',
                this.data.cityIndex ? cities[this.data.cityIndex] : '',
                this.data.distanceIndex ? distances[this.data.distanceIndex] : '',
                this.data.signupIndex ? signupOptions[this.data.signupIndex].label : '',
                this.data.judgementIndex ? judgementOptions[this.data.judgementIndex].label : '',
                this.data.monthIndex ? months[this.data.monthIndex] : '',
            ].filter(Boolean);
            const [eventRes, favoriteRes] = await Promise.all([
                (0, api_1.getEvents)(params),
                (0, api_1.getFavorites)(userKey).catch(() => ({ items: [] })),
            ]);
            const favoriteIds = new Set(favoriteRes.items.map((item) => item.eventId));
            const nextEvents = eventRes.items.map((item) => (Object.assign(Object.assign({}, item), { isFavorite: favoriteIds.has(item.id) })));
            const events = reset ? nextEvents : [...this.data.events, ...nextEvents];
            this.setData({
                loading: false,
                loadingMore: false,
                didInitialLoad: true,
                total: eventRes.total,
                resultText: `找到 ${eventRes.total} 场赛事`,
                activeFilterText: activeFilters.join(' · ') || '全部未来赛事',
                hasActiveFilter: activeFilters.length > 0,
                hasMore: events.length < eventRes.total,
                events,
            });
        }
        catch (error) {
            this.setData({
                loading: false,
                loadingMore: false,
                didInitialLoad: true,
                error: reset ? error.message || '网络异常' : this.data.error,
                errorRequestId: reset && error instanceof api_1.ApiError ? error.requestId || '' : this.data.errorRequestId,
            });
            wx.showToast({ title: reset ? '网络异常' : '加载失败', icon: 'none' });
        }
    },
    reload() {
        this.load(true);
    },
    reportProblem() {
        (0, product_feedback_1.openProductFeedback)('events', this.data.errorRequestId || undefined);
    },
    onReachBottom() {
        if (!this.data.hasMore) {
            wx.showToast({ title: '没有更多了', icon: 'none' });
            return;
        }
        this.load(false);
    },
    onSearch(event) {
        this.setData({ search: event.detail.value });
    },
    submitSearch() {
        this.load(true);
    },
    resetFilters() {
        this.setData({
            search: '',
            cityIndex: 0,
            distanceIndex: 0,
            signupIndex: 0,
            judgementIndex: 0,
            monthIndex: 0,
            hasActiveFilter: false,
        });
        this.load(true);
    },
    onCityChange(event) {
        this.setData({ cityIndex: Number(event.detail.value) });
        this.load(true);
    },
    onDistanceChange(event) {
        this.setData({ distanceIndex: Number(event.detail.value) });
        this.load(true);
    },
    onSignupChange(event) {
        this.setData({ signupIndex: Number(event.detail.value) });
        this.load(true);
    },
    onJudgementChange(event) {
        this.setData({ judgementIndex: Number(event.detail.value) });
        this.load(true);
    },
    onMonthChange(event) {
        this.setData({ monthIndex: Number(event.detail.value) });
        this.load(true);
    },
    toggleFilters() {
        this.setData({ filtersExpanded: !this.data.filtersExpanded });
    },
    openEvent(event) {
        wx.navigateTo({ url: `/pages/event-detail/index?id=${event.detail.id}` });
    },
    async toggleFavorite(event) {
        const { id, isFavorite } = event.detail;
        try {
            if (isFavorite) {
                await (0, api_1.removeFavorite)(this.data.userKey, id);
                wx.showToast({ title: '已取消收藏', icon: 'success' });
            }
            else {
                await (0, api_1.addFavorite)(this.data.userKey, id);
                wx.showToast({ title: '收藏成功', icon: 'success' });
            }
            this.load(true);
        }
        catch (_a) {
            wx.showToast({ title: isFavorite ? '取消收藏失败' : '收藏失败', icon: 'none' });
        }
    },
    onShareAppMessage() {
        (0, share_1.trackShare)('page_share', 'events');
        return (0, share_1.getSharePayload)('events', '/pages/events/index');
    },
    onShareTimeline() {
        (0, share_1.trackShare)('timeline_share', 'events');
        const payload = (0, share_1.getSharePayload)('events', '/pages/events/index');
        return { title: payload.title, imageUrl: payload.imageUrl };
    },
});

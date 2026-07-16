"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const user_1 = require("../../utils/user");
const cities = [
    '全部',
    '广州',
    '深圳',
    '珠海',
    '佛山',
    '惠州',
    '东莞',
    '中山',
    '江门',
    '肇庆',
    '香港',
    '澳门',
];
const distances = ['全部', '5K', '10K', '半马', '全马', '欢乐跑'];
const signupOptions = [
    { label: '全部', value: '' },
    { label: '报名中', value: 'signup_open' },
    { label: '即将截止', value: 'closing_soon' },
    { label: '未开始', value: 'not_started' },
    { label: '已截止', value: 'closed' },
    { label: '待核实', value: 'unknown' },
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
        userKey: '',
        search: '',
        cityIndex: 0,
        distanceIndex: 0,
        signupIndex: 0,
        judgementIndex: 0,
        cities,
        distances,
        signupLabels: signupOptions.map((item) => item.label),
        judgementLabels: judgementOptions.map((item) => item.label),
        events: [],
        page: 1,
        pageSize: 10,
        total: 0,
        hasMore: true,
        loadingMore: false,
        didInitialLoad: false,
        activeFilterText: '全部未来赛事',
        resultText: '',
    },
    onLoad() {
        this.load(true);
    },
    onShow() {
        if (!this.data.didInitialLoad)
            return;
        this.load(true);
    },
    async load(reset = false) {
        const userKey = (0, user_1.getUserKey)();
        if (!reset && (this.data.loadingMore || !this.data.hasMore))
            return;
        const page = reset ? 1 : this.data.page + 1;
        this.setData(Object.assign({ loading: reset, loadingMore: !reset, error: '', userKey,
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
            };
            const activeFilters = [
                this.data.search.trim() ? `搜索：${this.data.search.trim()}` : '',
                this.data.cityIndex ? cities[this.data.cityIndex] : '',
                this.data.distanceIndex ? distances[this.data.distanceIndex] : '',
                this.data.signupIndex ? signupOptions[this.data.signupIndex].label : '',
                this.data.judgementIndex ? judgementOptions[this.data.judgementIndex].label : '',
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
            });
            wx.showToast({ title: reset ? '网络异常' : '加载失败', icon: 'none' });
        }
    },
    reload() {
        this.load(true);
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
});

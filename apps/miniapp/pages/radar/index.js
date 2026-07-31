"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const user_1 = require("../../utils/user");
const radar_1 = require("../../utils/radar");
const share_1 = require("../../utils/share");
const cityOptions = ['北京', '上海', '广州', '深圳', '杭州', '成都', '重庆', '武汉', '厦门', '西安', '香港', '澳门'];
const distanceOptions = ['5K', '10K', '半马', '全马', '欢乐跑'];
const focusOptions = ['新手友好', '交通方便', '风景路线', '适合 PB', '周末可去', '信息完整'];
function makeChips(options, selected) {
    return options.map((label) => ({ label, selected: selected.includes(label) }));
}
Page({
    data: {
        loading: true,
        error: '',
        errorRequestId: '',
        userKey: '',
        cities: [],
        distances: [],
        focusTags: [],
        cityChips: makeChips(cityOptions, []),
        distanceChips: makeChips(distanceOptions, []),
        focusChips: makeChips(focusOptions, []),
        generatedAt: '',
        windowDays: 90,
        totalCount: 0,
        displayGroups: [],
        showNoPrefHint: false,
        complianceNotice: 'AI 整理，仅供参考，报名以官方为准。',
        officialActionText: '前往官方确认',
    },
    onLoad(query) {
        (0, share_1.enablePublicShare)();
        // 支持分享路径携带的 campaign / cities / distances 参数贯穿首日行为
        const campaign = query.campaign || query.campaignCode || '';
        const initialCities = query.cities ? query.cities.split(',').filter(Boolean) : [];
        const initialDistances = query.distances ? query.distances.split(',').filter(Boolean) : [];
        this.setData({
            cities: initialCities,
            distances: initialDistances,
            cityChips: makeChips(cityOptions, initialCities),
            distanceChips: makeChips(distanceOptions, initialDistances),
            // campaign 存到 data 供 load/埋点使用（不写入 data 以避免渲染，用实例字段）
        });
        this.campaign = campaign;
        this.load();
    },
    onShow() {
        // 仅在已加载过时刷新（避免 onLoad 重复加载）
        if (!this.data.loading && this.data.generatedAt)
            this.load();
    },
    async load() {
        const userKey = (0, user_1.getUserKey)();
        const instance = this;
        this.setData({ loading: true, error: '', errorRequestId: '', userKey });
        try {
            const params = (0, radar_1.buildRadarQuery)({
                cities: this.data.cities,
                distances: this.data.distances,
                focusTags: this.data.focusTags,
                windowDays: this.data.windowDays,
                campaign: instance.campaign,
            });
            const response = await (0, api_1.getRadar)(params);
            const displayGroups = (0, radar_1.toDisplayGroups)(response).map((group) => (Object.assign(Object.assign({}, group), { 
                // 把匹配理由映射到 event-card 读取的 judgementReasons，badges 映射到 tags，复用现有卡片渲染
                items: group.items.map((item) => (Object.assign(Object.assign({}, item), { judgementReasons: item.matchReasons && item.matchReasons.length ? item.matchReasons : [], tags: item.badges || [] }))) })));
            this.setData({
                loading: false,
                generatedAt: response.generatedAt,
                totalCount: (0, radar_1.radarTotalCount)(response),
                displayGroups,
                showNoPrefHint: (0, radar_1.hasNoPreferences)(response.filters),
                complianceNotice: response.complianceNotice,
                officialActionText: response.officialActionText,
            });
            // 页面真正渲染成功后才发送 viewed_radar（交接文档 §8.2）
            this.recordViewedRadar();
        }
        catch (error) {
            this.setData({
                loading: false,
                error: error.message || '网络异常',
                errorRequestId: error instanceof api_1.ApiError ? error.requestId || '' : '',
            });
            wx.showToast({ title: '雷达加载失败', icon: 'none' });
        }
    },
    recordViewedRadar() {
        const instance = this;
        (0, api_1.recordVisitorActivity)({
            userKey: this.data.userKey,
            action: 'viewed_radar',
            entryPage: 'radar',
            campaign: instance.campaign,
        }).catch(() => {
            // 埋点失败不阻塞
        });
    },
    toggleChip(event) {
        const { group, value } = event.currentTarget.dataset;
        const key = group;
        const current = (this.data[key] || []);
        const next = current.includes(value)
            ? current.filter((item) => item !== value)
            : [...current, value];
        const patch = { [group]: next };
        if (group === 'cities')
            patch.cityChips = makeChips(cityOptions, next);
        if (group === 'distances')
            patch.distanceChips = makeChips(distanceOptions, next);
        if (group === 'focusTags')
            patch.focusChips = makeChips(focusOptions, next);
        this.setData(patch);
    },
    applyFilters() {
        this.load();
    },
    clearFilters() {
        this.setData({
            cities: [],
            distances: [],
            focusTags: [],
            cityChips: makeChips(cityOptions, []),
            distanceChips: makeChips(distanceOptions, []),
            focusChips: makeChips(focusOptions, []),
        });
        this.load();
    },
    openEvent(event) {
        wx.navigateTo({ url: `/pages/event-detail/index?id=${event.detail.id}` });
    },
    openPreference() {
        wx.navigateTo({ url: '/pages/preferences/index' });
    },
    reload() {
        this.load();
    },
    onShareAppMessage() {
        const instance = this;
        (0, share_1.trackShare)('page_share', 'radar');
        const citiesParam = this.data.cities.length ? `&cities=${this.data.cities.join(',')}` : '';
        const distancesParam = this.data.distances.length
            ? `&distances=${this.data.distances.join(',')}`
            : '';
        const campaignParam = instance.campaign ? `&campaign=${instance.campaign}` : '';
        const path = `/pages/radar/index?${[citiesParam, distancesParam, campaignParam]
            .filter(Boolean)
            .join('')
            .slice(1)}`;
        return (0, share_1.getSharePayload)('radar', path);
    },
    onShareTimeline() {
        (0, share_1.trackShare)('timeline_share', 'radar');
        const payload = this.onShareAppMessage();
        return { title: payload.title, imageUrl: payload.imageUrl };
    },
});

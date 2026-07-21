"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const user_1 = require("../../utils/user");
const share_1 = require("../../utils/share");
const cityOptions = ['广州', '深圳', '佛山', '东莞', '珠海', '中山', '惠州', '香港', '澳门'];
const distanceOptions = ['5K', '10K', '半马', '全马', '欢乐跑'];
const focusOptions = ['新手友好', '交通方便', '风景路线', '适合 PB', '周末可去', '信息完整'];
function makeChips(options, selected) {
    return options.map((label) => ({ label, selected: selected.includes(label) }));
}
Page({
    data: {
        loading: true,
        error: '',
        userKey: '',
        cities: [],
        distances: [],
        focusTags: [],
        cityChips: makeChips(cityOptions, []),
        distanceChips: makeChips(distanceOptions, []),
        focusChips: makeChips(focusOptions, []),
    },
    onLoad() {
        (0, share_1.enableProductShareOnly)();
        this.load();
    },
    async load() {
        const userKey = (0, user_1.getUserKey)();
        this.setData({ userKey, loading: true, error: '' });
        const preference = await (0, api_1.getPreference)(userKey).catch(() => null);
        const cities = (preference === null || preference === void 0 ? void 0 : preference.cities) || [];
        const distances = (preference === null || preference === void 0 ? void 0 : preference.distances) || [];
        const focusTags = (preference === null || preference === void 0 ? void 0 : preference.focusTags) || [];
        this.setData({
            loading: false,
            cities,
            distances,
            focusTags,
            cityChips: makeChips(cityOptions, cities),
            distanceChips: makeChips(distanceOptions, distances),
            focusChips: makeChips(focusOptions, focusTags),
        });
    },
    toggleChip(event) {
        const { group, value } = event.currentTarget.dataset;
        const current = (this.data[group] || []);
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
    async save() {
        try {
            await (0, api_1.savePreference)({
                userKey: this.data.userKey,
                cities: this.data.cities,
                distances: this.data.distances,
                focusTags: this.data.focusTags,
            });
            wx.showToast({ title: '保存成功', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 500);
        }
        catch (error) {
            const message = error.message || '偏好保存失败';
            this.setData({ error: message });
            wx.showToast({ title: '偏好保存失败', icon: 'none' });
        }
    },
    reset() {
        this.setData({
            cities: [],
            distances: [],
            focusTags: [],
            cityChips: makeChips(cityOptions, []),
            distanceChips: makeChips(distanceOptions, []),
            focusChips: makeChips(focusOptions, []),
            error: '',
        });
    },
    skip() {
        wx.navigateBack();
    },
    onShareAppMessage() {
        return (0, share_1.getProductHomeShare)();
    },
});

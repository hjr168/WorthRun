"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const user_1 = require("../../utils/user");
const share_1 = require("../../utils/share");
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
        provinceCodes: [],
        cityCodes: [],
        provinces: [],
        filteredProvinces: [],
        activeProvinceCode: '',
        provinceSearch: '',
        distances: [],
        focusTags: [],
        cityChips: [],
        distanceChips: makeChips(distanceOptions, []),
        focusChips: makeChips(focusOptions, []),
    },
    onLoad() {
        (0, share_1.enableProductShareOnly)();
        this.load();
    },
    async load() {
        var _a, _b, _c, _d;
        const userKey = (0, user_1.getUserKey)();
        this.setData({ userKey, loading: true, error: '' });
        const [preference, regions] = await Promise.all([(0, api_1.getPreference)(userKey).catch(() => null), (0, api_1.getRegions)().catch(() => ({ provinces: [] }))]);
        const cities = (preference === null || preference === void 0 ? void 0 : preference.cities) || [];
        const provinceCodes = (preference === null || preference === void 0 ? void 0 : preference.provinceCodes) || [];
        const cityCodes = (preference === null || preference === void 0 ? void 0 : preference.cityCodes) || [];
        const distances = (preference === null || preference === void 0 ? void 0 : preference.distances) || [];
        const focusTags = (preference === null || preference === void 0 ? void 0 : preference.focusTags) || [];
        this.setData({
            loading: false,
            cities,
            provinceCodes,
            cityCodes,
            provinces: regions.provinces,
            filteredProvinces: regions.provinces,
            activeProvinceCode: ((_a = regions.provinces.find((item) => item.provinceCode === provinceCodes[0])) === null || _a === void 0 ? void 0 : _a.provinceCode) || ((_b = regions.provinces[0]) === null || _b === void 0 ? void 0 : _b.provinceCode) || '',
            cityChips: this.cityChipsFor(regions.provinces, ((_c = regions.provinces.find((item) => item.provinceCode === provinceCodes[0])) === null || _c === void 0 ? void 0 : _c.provinceCode) || ((_d = regions.provinces[0]) === null || _d === void 0 ? void 0 : _d.provinceCode) || '', cityCodes),
            distances,
            focusTags,
            distanceChips: makeChips(distanceOptions, distances),
            focusChips: makeChips(focusOptions, focusTags),
        });
    },
    cityChipsFor(provinces, provinceCode, selected) {
        var _a;
        return (((_a = provinces.find((item) => item.provinceCode === provinceCode)) === null || _a === void 0 ? void 0 : _a.cities) || []).map((item) => ({ label: item.cityName, value: item.cityCode, selected: selected.includes(item.cityCode) }));
    },
    searchProvince(event) {
        const value = event.detail.value || '';
        this.setData({ provinceSearch: value, filteredProvinces: this.data.provinces.filter((item) => item.provinceName.includes(value)) });
    },
    selectProvince(event) {
        const provinceCode = event.currentTarget.dataset.code;
        this.setData({ activeProvinceCode: provinceCode, cityChips: this.cityChipsFor(this.data.provinces, provinceCode, this.data.cityCodes) });
    },
    toggleCity(event) {
        const cityCode = event.currentTarget.dataset.code;
        const city = this.data.provinces.flatMap((item) => item.cities).find((item) => item.cityCode === cityCode);
        const cityCodes = this.data.cityCodes.includes(cityCode) ? this.data.cityCodes.filter((item) => item !== cityCode) : [...this.data.cityCodes, cityCode];
        const cities = city ? (this.data.cities.includes(city.cityName) ? this.data.cities.filter((item) => item !== city.cityName) : [...this.data.cities, city.cityName]) : this.data.cities;
        const provinceCodes = [...new Set(this.data.provinces.filter((item) => item.cities.some((candidate) => cityCodes.includes(candidate.cityCode))).map((item) => item.provinceCode))];
        this.setData({ cityCodes, provinceCodes, cities, cityChips: this.cityChipsFor(this.data.provinces, this.data.activeProvinceCode, cityCodes) });
    },
    toggleChip(event) {
        const { group, value } = event.currentTarget.dataset;
        const current = (this.data[group] || []);
        const next = current.includes(value)
            ? current.filter((item) => item !== value)
            : [...current, value];
        const patch = { [group]: next };
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
                provinceCodes: this.data.provinceCodes,
                cityCodes: this.data.cityCodes,
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
            provinceCodes: [],
            cityCodes: [],
            distances: [],
            focusTags: [],
            cityChips: this.cityChipsFor(this.data.provinces, this.data.activeProvinceCode, []),
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

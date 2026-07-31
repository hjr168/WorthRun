import { getPreference, getRegions, RegionProvince, savePreference } from '../../utils/api';
import { getUserKey } from '../../utils/user';
import { enableProductShareOnly, getProductHomeShare } from '../../utils/share';

const distanceOptions = ['5K', '10K', '半马', '全马', '欢乐跑'];
const focusOptions = ['新手友好', '交通方便', '风景路线', '适合 PB', '周末可去', '信息完整'];

function makeChips(options: string[], selected: string[]) {
  return options.map((label) => ({ label, selected: selected.includes(label) }));
}

Page({
  data: {
    loading: true,
    error: '',
    userKey: '',
    cities: [] as string[],
    provinceCodes: [] as string[],
    cityCodes: [] as string[],
    provinces: [] as RegionProvince[],
    filteredProvinces: [] as RegionProvince[],
    activeProvinceCode: '',
    provinceSearch: '',
    distances: [] as string[],
    focusTags: [] as string[],
    cityChips: [] as Array<{ label: string; value: string; selected: boolean }>,
    distanceChips: makeChips(distanceOptions, []),
    focusChips: makeChips(focusOptions, []),
  },
  onLoad() {
    enableProductShareOnly();
    this.load();
  },
  async load() {
    const userKey = getUserKey();
    this.setData({ userKey, loading: true, error: '' });
    const [preference, regions] = await Promise.all([getPreference(userKey).catch(() => null), getRegions().catch(() => ({ provinces: [] }))]);
    const cities = preference?.cities || [];
    const provinceCodes = preference?.provinceCodes || [];
    const cityCodes = preference?.cityCodes || [];
    const distances = preference?.distances || [];
    const focusTags = preference?.focusTags || [];
    this.setData({
      loading: false,
      cities,
      provinceCodes,
      cityCodes,
      provinces: regions.provinces,
      filteredProvinces: regions.provinces,
      activeProvinceCode: regions.provinces.find((item) => item.provinceCode === provinceCodes[0])?.provinceCode || regions.provinces[0]?.provinceCode || '',
      cityChips: this.cityChipsFor(regions.provinces, regions.provinces.find((item) => item.provinceCode === provinceCodes[0])?.provinceCode || regions.provinces[0]?.provinceCode || '', cityCodes),
      distances,
      focusTags,
      distanceChips: makeChips(distanceOptions, distances),
      focusChips: makeChips(focusOptions, focusTags),
    });
  },
  cityChipsFor(provinces: RegionProvince[], provinceCode: string, selected: string[]) {
    return (provinces.find((item) => item.provinceCode === provinceCode)?.cities || []).map((item) => ({ label: item.cityName, value: item.cityCode, selected: selected.includes(item.cityCode) }));
  },
  searchProvince(event: WechatMiniprogram.Input) {
    const value = event.detail.value || '';
    this.setData({ provinceSearch: value, filteredProvinces: this.data.provinces.filter((item) => item.provinceName.includes(value)) });
  },
  selectProvince(event: WechatMiniprogram.TouchEvent) {
    const provinceCode = event.currentTarget.dataset.code as string;
    this.setData({ activeProvinceCode: provinceCode, cityChips: this.cityChipsFor(this.data.provinces, provinceCode, this.data.cityCodes) });
  },
  toggleCity(event: WechatMiniprogram.TouchEvent) {
    const cityCode = event.currentTarget.dataset.code as string;
    const city = this.data.provinces.flatMap((item) => item.cities).find((item) => item.cityCode === cityCode);
    const cityCodes = this.data.cityCodes.includes(cityCode) ? this.data.cityCodes.filter((item) => item !== cityCode) : [...this.data.cityCodes, cityCode];
    const cities = city ? (this.data.cities.includes(city.cityName) ? this.data.cities.filter((item) => item !== city.cityName) : [...this.data.cities, city.cityName]) : this.data.cities;
    const provinceCodes = [...new Set(this.data.provinces.filter((item) => item.cities.some((candidate) => cityCodes.includes(candidate.cityCode))).map((item) => item.provinceCode))];
    this.setData({ cityCodes, provinceCodes, cities, cityChips: this.cityChipsFor(this.data.provinces, this.data.activeProvinceCode, cityCodes) });
  },
  toggleChip(event: WechatMiniprogram.TouchEvent) {
    const { group, value } = event.currentTarget.dataset as { group: string; value: string };
    const current = (this.data[group as 'cities' | 'distances' | 'focusTags'] || []) as string[];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    const patch: Record<string, unknown> = { [group]: next };
    if (group === 'distances') patch.distanceChips = makeChips(distanceOptions, next);
    if (group === 'focusTags') patch.focusChips = makeChips(focusOptions, next);
    this.setData(patch);
  },
  async save() {
    try {
      await savePreference({
        userKey: this.data.userKey,
        cities: this.data.cities,
        provinceCodes: this.data.provinceCodes,
        cityCodes: this.data.cityCodes,
        distances: this.data.distances,
        focusTags: this.data.focusTags,
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      const message = (error as Error).message || '偏好保存失败';
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
    return getProductHomeShare();
  },
});

import { getPreference, savePreference } from '../../utils/api';
import { getUserKey } from '../../utils/user';

Page({
  data: {
    loading: true,
    userKey: '',
    citiesText: '',
    distancesText: '',
    focusTagsText: '',
  },
  onLoad() {
    this.load();
  },
  async load() {
    const userKey = getUserKey();
    this.setData({ userKey, loading: true });
    const preference = await getPreference(userKey).catch(() => null);
    this.setData({
      loading: false,
      citiesText: preference?.cities.join('、') || '',
      distancesText: preference?.distances.join('、') || '',
      focusTagsText: preference?.focusTags.join('、') || '',
    });
  },
  onCitiesInput(event: WechatMiniprogram.Input) {
    this.setData({ citiesText: event.detail.value });
  },
  onDistancesInput(event: WechatMiniprogram.Input) {
    this.setData({ distancesText: event.detail.value });
  },
  onFocusInput(event: WechatMiniprogram.Input) {
    this.setData({ focusTagsText: event.detail.value });
  },
  toList(value: string) {
    return value
      .split(/[,，、\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  },
  async save() {
    await savePreference({
      userKey: this.data.userKey,
      cities: this.toList(this.data.citiesText),
      distances: this.toList(this.data.distancesText),
      focusTags: this.toList(this.data.focusTagsText),
    });
    wx.showToast({ title: '保存成功', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 500);
  },
  reset() {
    this.setData({ citiesText: '', distancesText: '', focusTagsText: '' });
  },
  skip() {
    wx.navigateBack();
  },
});

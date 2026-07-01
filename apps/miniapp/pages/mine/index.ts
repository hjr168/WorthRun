import { EventDetail, getFavorites, getPreference, Preference } from '../../utils/api';
import { complianceNotice, formatDate } from '../../utils/format';
import { getUserKey } from '../../utils/user';

Page({
  data: {
    loading: true,
    error: '',
    userKey: '',
    shortUserKey: '',
    preference: null as Preference | null,
    preferenceText: '尚未设置偏好',
    nextEvent: null as EventDetail | null,
    nextEventDate: '',
    complianceNotice,
  },
  onShow() {
    this.load();
  },
  async load() {
    const userKey = getUserKey();
    this.setData({ loading: true, error: '', userKey });
    try {
      const [preference, favorites] = await Promise.all([
        getPreference(userKey).catch(() => null),
        getFavorites(userKey),
      ]);
      const nextEvent = favorites.items[0]?.event || null;
      const preferenceText = preference
        ? `${preference.cities.join('、') || '城市不限'} · ${preference.distances.join('、') || '距离不限'}`
        : '尚未设置偏好';
      this.setData({
        loading: false,
        userKey,
        shortUserKey: `${userKey.slice(0, 10)}...`,
        preference,
        preferenceText,
        nextEvent,
        nextEventDate: nextEvent ? formatDate(nextEvent.eventDate) : '',
        complianceNotice,
      });
    } catch (error) {
      this.setData({
        loading: false,
        shortUserKey: `${userKey.slice(0, 10)}...`,
        error: (error as Error).message || '网络异常',
      });
    }
  },
  openPreferences() {
    wx.navigateTo({ url: '/pages/preferences/index' });
  },
  openFavorites() {
    wx.navigateTo({ url: '/pages/favorites/index' });
  },
  openFeedback() {
    if (this.data.nextEvent) {
      wx.navigateTo({ url: `/pages/feedback/index?eventId=${this.data.nextEvent.id}` });
      return;
    }
    wx.switchTab({ url: '/pages/events/index' });
  },
  openTools() {
    wx.navigateTo({ url: '/pages/tools/index' });
  },
  openNextEvent() {
    if (!this.data.nextEvent) return;
    wx.navigateTo({ url: `/pages/event-detail/index?id=${this.data.nextEvent.id}` });
  },
});

import {
  addFavorite,
  EventSummary,
  getEvents,
  getFavorites,
  getPreference,
  Preference,
  removeFavorite,
} from '../../utils/api';
import { getUserKey } from '../../utils/user';

Page({
  data: {
    loading: true,
    error: '',
    userKey: '',
    preference: null as Preference | null,
    preferenceText: '',
    events: [] as EventSummary[],
    closingEvents: [] as EventSummary[],
  },
  onShow() {
    this.load();
  },
  async load() {
    const userKey = getUserKey();
    this.setData({ loading: true, error: '', userKey });
    try {
      const preference = await getPreference(userKey).catch(() => null);
      const params = {
        page: 1,
        pageSize: 8,
        city: preference?.cities[0] || '',
        distance: preference?.distances[0] || '',
      };
      const [eventRes, favoriteRes] = await Promise.all([
        getEvents(params),
        getFavorites(userKey).catch(() => ({ items: [] })),
      ]);
      const favoriteIds = new Set(favoriteRes.items.map((item) => item.eventId));
      const events = eventRes.items.map((item) => ({
        ...item,
        isFavorite: favoriteIds.has(item.id),
      }));
      const preferenceText = preference
        ? `${preference.cities.join('、') || '城市不限'} · ${preference.distances.join('、') || '距离不限'}`
        : '';
      this.setData({
        events: events.slice(0, 4),
        closingEvents: events.filter((item) => item.signupStatus === 'closing_soon').slice(0, 3),
        preference,
        preferenceText,
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false, error: (error as Error).message || '网络异常' });
      wx.showToast({ title: '网络异常', icon: 'none' });
    }
  },
  openPreference() {
    wx.navigateTo({ url: '/pages/preferences/index' });
  },
  openEvents() {
    wx.switchTab({ url: '/pages/events/index' });
  },
  openTools() {
    wx.navigateTo({ url: '/pages/tools/index' });
  },
  openEvent(event: WechatMiniprogram.CustomEvent) {
    wx.navigateTo({ url: `/pages/event-detail/index?id=${event.detail.id}` });
  },
  async toggleFavorite(event: WechatMiniprogram.CustomEvent) {
    const { id, isFavorite } = event.detail;
    try {
      if (isFavorite) {
        await removeFavorite(this.data.userKey, id);
        wx.showToast({ title: '已取消收藏', icon: 'success' });
      } else {
        await addFavorite(this.data.userKey, id);
        wx.showToast({ title: '收藏成功', icon: 'success' });
      }
      this.load();
    } catch {
      wx.showToast({ title: isFavorite ? '取消收藏失败' : '收藏失败', icon: 'none' });
    }
  },
});

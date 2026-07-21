import {
  addFavorite,
  ApiError,
  EventSummary,
  getEvents,
  getFavorites,
  getPreference,
  Preference,
  removeFavorite,
} from '../../utils/api';
import { getUserKey } from '../../utils/user';
import { groupHomeEvents } from '../../utils/home';
import { openProductFeedback } from '../../utils/product-feedback';
import { enablePublicShare, getSharePayload, trackShare } from '../../utils/share';

Page({
  data: {
    loading: true,
    error: '',
    errorRequestId: '',
    userKey: '',
    preference: null as Preference | null,
    preferenceText: '',
    priorityEvents: [] as EventSummary[],
    closingEvents: [] as EventSummary[],
    recentEvents: [] as EventSummary[],
    fallbackNotice: '',
  },
  onLoad() {
    enablePublicShare();
  },
  onShow() {
    this.load();
  },
  async load() {
    const userKey = getUserKey();
    this.setData({ loading: true, error: '', errorRequestId: '', fallbackNotice: '', userKey });
    try {
      const preference = await getPreference(userKey).catch(() => null);
      const params = {
        page: 1,
        pageSize: 10,
        city: preference?.cities[0] || '',
        distance: preference?.distances[0] || '',
      };
      const [eventRes, favoriteRes] = await Promise.all([
        this.getEventsWithFallback(params),
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
      const groups = groupHomeEvents(events);
      this.setData({
        ...groups,
        fallbackNotice: eventRes.usedFallback ? '暂未找到完全匹配偏好的赛事，先看看近期赛事。' : '',
        preference,
        preferenceText,
        loading: false,
      });
    } catch (error) {
      this.setData({
        loading: false,
        error: (error as Error).message || '网络异常',
        errorRequestId: error instanceof ApiError ? error.requestId || '' : '',
      });
      wx.showToast({ title: '网络异常', icon: 'none' });
    }
  },
  reload() {
    this.load();
  },
  reportProblem() {
    openProductFeedback('home', this.data.errorRequestId || undefined);
  },
  async getEventsWithFallback(params: {
    page: number;
    pageSize: number;
    city: string;
    distance: string;
  }) {
    const firstRes = await getEvents(params);
    if (firstRes.items.length) return { ...firstRes, usedFallback: false };

    if (params.city) {
      const cityRes = await getEvents({
        page: params.page,
        pageSize: params.pageSize,
        city: params.city,
      });
      if (cityRes.items.length) return { ...cityRes, usedFallback: Boolean(params.distance) };
    }

    const allRes = await getEvents({ page: params.page, pageSize: params.pageSize });
    return {
      ...allRes,
      usedFallback: Boolean(params.city || params.distance) && allRes.items.length > 0,
    };
  },
  openPreference() {
    wx.navigateTo({ url: '/pages/preferences/index' });
  },
  openEvents() {
    wx.switchTab({ url: '/pages/events/index' });
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
  onShareAppMessage() {
    trackShare('page_share', 'home');
    return getSharePayload('home', '/pages/home/index');
  },
  onShareTimeline() {
    trackShare('timeline_share', 'home');
    const payload = getSharePayload('home', '/pages/home/index');
    return { title: payload.title, imageUrl: payload.imageUrl };
  },
});

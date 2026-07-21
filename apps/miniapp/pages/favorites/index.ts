import { ApiError, EventSummary, getFavorites, removeFavorite } from '../../utils/api';
import { getUserKey } from '../../utils/user';
import { openProductFeedback } from '../../utils/product-feedback';
import { enableProductShareOnly, getProductHomeShare } from '../../utils/share';

Page({
  data: {
    loading: true,
    error: '',
    errorRequestId: '',
    userKey: '',
    events: [] as EventSummary[],
  },
  onShow() {
    enableProductShareOnly();
    this.load();
  },
  async load() {
    const userKey = getUserKey();
    this.setData({ userKey, loading: true, error: '', errorRequestId: '' });
    try {
      const res = await getFavorites(userKey);
      this.setData({
        loading: false,
        events: res.items.map((item) => ({
          ...item.event,
          sourceReviewPending: Boolean(item.event.sourceReviewPending),
          isFavorite: true,
        })),
      });
    } catch (error) {
      this.setData({
        loading: false,
        error: (error as Error).message || '网络异常',
        errorRequestId: error instanceof ApiError ? error.requestId || '' : '',
      });
    }
  },
  reload() {
    this.load();
  },
  reportProblem() {
    openProductFeedback('favorites', this.data.errorRequestId || undefined);
  },
  openEvent(event: WechatMiniprogram.CustomEvent) {
    wx.navigateTo({ url: `/pages/event-detail/index?id=${event.detail.id}` });
  },
  async toggleFavorite(event: WechatMiniprogram.CustomEvent) {
    try {
      await removeFavorite(this.data.userKey, event.detail.id);
      wx.showToast({ title: '已取消收藏', icon: 'success' });
      this.load();
    } catch {
      wx.showToast({ title: '取消收藏失败', icon: 'none' });
    }
  },
  openEvents() {
    wx.switchTab({ url: '/pages/events/index' });
  },
  onShareAppMessage() {
    return getProductHomeShare();
  },
});

import {
  addFavorite,
  EventDetail,
  getEventDetail,
  getFavorites,
  removeFavorite,
} from '../../utils/api';
import {
  complianceNotice,
  formatDate,
  formatDistance,
  labelOf,
  officialActionText,
  signupStatusLabels,
} from '../../utils/format';
import { getUserKey } from '../../utils/user';

Page({
  data: {
    id: '',
    userKey: '',
    loading: true,
    error: '',
    event: null as EventDetail | null,
    isFavorite: false,
    dateText: '',
    distanceText: '',
    signupText: '',
    complianceNotice,
    officialActionText,
  },
  onLoad(query: { id?: string }) {
    this.setData({ id: query.id || '', userKey: getUserKey() });
    this.load();
  },
  async load() {
    if (!this.data.id) {
      this.setData({ loading: false, error: '赛事不存在或未发布' });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const [detail, favorites] = await Promise.all([
        getEventDetail(this.data.id),
        getFavorites(this.data.userKey).catch(() => ({ items: [] })),
      ]);
      this.setData({
        event: detail.event,
        isFavorite: favorites.items.some((item) => item.eventId === this.data.id),
        dateText: formatDate(detail.event.eventDate),
        distanceText: formatDistance(detail.event.distanceItems),
        signupText: labelOf(signupStatusLabels, detail.event.signupStatus),
        complianceNotice: detail.complianceNotice || complianceNotice,
        officialActionText: detail.officialActionText || officialActionText,
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false, error: (error as Error).message || '赛事不存在或未发布' });
    }
  },
  async toggleFavorite() {
    if (!this.data.event) return;
    try {
      if (this.data.isFavorite) {
        await removeFavorite(this.data.userKey, this.data.event.id);
        wx.showToast({ title: '已取消收藏', icon: 'success' });
      } else {
        await addFavorite(this.data.userKey, this.data.event.id);
        wx.showToast({ title: '收藏成功', icon: 'success' });
      }
      this.setData({ isFavorite: !this.data.isFavorite });
    } catch {}
  },
  openOfficial() {
    const url = this.data.event?.officialUrl;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '官方链接已复制', icon: 'success' }),
      fail: () => wx.showToast({ title: '请前往官方渠道确认', icon: 'none' }),
    });
  },
  openFeedback() {
    wx.navigateTo({ url: `/pages/feedback/index?eventId=${this.data.id}` });
  },
});

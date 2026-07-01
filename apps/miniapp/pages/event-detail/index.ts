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
  formatDateTime,
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
    updatedAtText: '待确认',
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
        updatedAtText: formatDateTime(detail.event.updatedAt),
        complianceNotice: detail.complianceNotice || complianceNotice,
        officialActionText: detail.officialActionText || officialActionText,
        loading: false,
      });
    } catch (error) {
      this.setData({
        loading: false,
        event: null,
        error: (error as Error).message || '赛事不存在或未发布',
      });
    }
  },
  reload() {
    this.load();
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
    if (!url) {
      wx.showToast({ title: '请前往官方渠道确认', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: url,
      success: () =>
        wx.showModal({
          title: '官方链接已复制',
          content:
            '小程序暂不直接跳转外部链接，已为你复制官方链接。请在浏览器或微信中打开后，以官方信息为准。',
          showCancel: false,
          confirmText: '知道了',
        }),
      fail: () => wx.showToast({ title: '请前往官方渠道确认', icon: 'none' }),
    });
  },
  openFeedback() {
    wx.navigateTo({ url: `/pages/feedback/index?eventId=${this.data.id}` });
  },
});

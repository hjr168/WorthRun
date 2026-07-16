import {
  addFavorite,
  EventDetail,
  getEventDetail,
  getFavorites,
  recordInteraction,
  recordShare,
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
    sourceCheckedAtText: '等待复核',
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
        sourceCheckedAtText: detail.event.sourceCheckedAt
          ? formatDateTime(detail.event.sourceCheckedAt)
          : '等待复核',
        complianceNotice: detail.complianceNotice || complianceNotice,
        officialActionText: detail.officialActionText || officialActionText,
        loading: false,
      });
      recordInteraction({
        userKey: this.data.userKey,
        eventId: detail.event.id,
        action: 'event_detail_view',
      }).catch(() => {});
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
      success: () => {
        recordInteraction({
          userKey: this.data.userKey,
          eventId: this.data.id,
          action: 'official_link_copy',
        }).catch(() => {});
        wx.showModal({
          title: '官方链接已复制',
          content:
            '小程序暂不直接跳转外部链接，已为你复制官方链接。请在浏览器或微信中打开后，以官方信息为准。',
          showCancel: false,
          confirmText: '知道了',
        });
      },
      fail: () => wx.showToast({ title: '请前往官方渠道确认', icon: 'none' }),
    });
  },
  openFeedback() {
    wx.navigateTo({ url: `/pages/feedback/index?eventId=${this.data.id}` });
  },
  openShareCard() {
    if (!this.data.event) return;
    wx.navigateTo({ url: `/pages/share-card/index?id=${this.data.id}` });
  },
  onShareAppMessage() {
    const event = this.data.event;
    if (event) {
      recordShare({
        userKey: this.data.userKey,
        eventId: event.id,
        shareType: 'page_share',
        scene: 'event_detail',
      }).catch(() => {});
    }
    return {
      title: event ? `这场值得跑吗？${event.eventName}` : '哪场值得跑｜大湾区跑步赛事决策工具',
      path: event ? `/pages/event-detail/index?id=${event.id}` : '/pages/home/index',
    };
  },
  onShareTimeline() {
    const event = this.data.event;
    return {
      title: event ? `这场值得跑吗？${event.eventName}` : '哪场值得跑',
      query: event ? `id=${event.id}` : '',
    };
  },
});

import { EventDetail, getFavorites, getPreference, Preference } from '../../utils/api';
import { config } from '../../config/index';
import { complianceNotice, formatDate, formatDateTime } from '../../utils/format';
import { clearUserKey, getUserKey } from '../../utils/user';
import { feedbackReceiptStorageKey, getFeedbackReceipts } from '../../utils/feedback';

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
    isDev: config.env === 'dev',
    feedbackReceipts: [] as Array<{
      requestId: string;
      eventName: string;
      feedbackType: string;
      createdAtText: string;
    }>,
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
      const feedbackReceipts = getFeedbackReceipts().map((item) => ({
        ...item,
        createdAtText: formatDateTime(item.createdAt),
      }));
      this.setData({
        loading: false,
        userKey,
        shortUserKey: `${userKey.slice(0, 10)}...`,
        preference,
        preferenceText,
        nextEvent,
        nextEventDate: nextEvent ? formatDate(nextEvent.eventDate) : '',
        complianceNotice,
        feedbackReceipts,
      });
    } catch (error) {
      this.setData({
        loading: false,
        shortUserKey: `${userKey.slice(0, 10)}...`,
        error: (error as Error).message || '网络异常',
      });
    }
  },
  reload() {
    this.load();
  },
  openPreferences() {
    wx.navigateTo({ url: '/pages/preferences/index' });
  },
  openFavorites() {
    wx.navigateTo({ url: '/pages/favorites/index' });
  },
  openFeedback() {
    wx.switchTab({
      url: '/pages/events/index',
      success: () => wx.showToast({ title: '请选择赛事后进入详情反馈', icon: 'none' }),
    });
  },
  openTools() {
    wx.navigateTo({ url: '/pages/tools/index' });
  },
  openNextEvent() {
    if (!this.data.nextEvent) return;
    wx.navigateTo({ url: `/pages/event-detail/index?id=${this.data.nextEvent.id}` });
  },
  clearLocalUserData() {
    wx.showModal({
      title: '清除本地用户数据',
      content: '将清除本地匿名标识。重新进入后会生成新的匿名身份，偏好和收藏会按新身份重新开始。',
      confirmText: '清除',
      success: (result) => {
        if (!result.confirm) return;
        clearUserKey();
        wx.removeStorageSync(feedbackReceiptStorageKey);
        wx.showToast({ title: '已清除', icon: 'success' });
        this.load();
      },
    });
  },
});

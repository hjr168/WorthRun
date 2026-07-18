import {
  EventDetail,
  EventSummary,
  getEventChoices,
  getFavorites,
  getPreference,
  Preference,
} from '../../utils/api';
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
    choiceCounts: { interested: 0, considering: 0, registered: 0 },
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
      const [preference, favorites, choices] = await Promise.all([
        getPreference(userKey).catch(() => null),
        getFavorites(userKey),
        getEventChoices(userKey).catch(() => ({ items: [] })),
      ]);
      const availableChoices = choices.items.filter(
        (item): item is typeof item & { event: EventSummary } => Boolean(item.event),
      );
      const nextChoice = [...availableChoices]
        .filter((item) => item.choice === 'registered' || item.choice === 'interested')
        .sort((left, right) => {
          const priority = { registered: 0, interested: 1, considering: 2 };
          const choiceDiff = priority[left.choice] - priority[right.choice];
          return choiceDiff || left.event!.eventDate.localeCompare(right.event!.eventDate);
        })[0];
      const nextEvent = (nextChoice?.event ||
        favorites.items[0]?.event ||
        null) as EventDetail | null;
      const choiceCounts = choices.items.reduce(
        (counts, item) => ({ ...counts, [item.choice]: counts[item.choice] + 1 }),
        { interested: 0, considering: 0, registered: 0 },
      );
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
        choiceCounts,
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
  openChoices() {
    wx.navigateTo({ url: '/pages/choices/index' });
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

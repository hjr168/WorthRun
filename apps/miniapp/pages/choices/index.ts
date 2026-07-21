import {
  ApiError,
  EventChoice,
  EventChoiceItem,
  getEventChoices,
  removeEventChoice,
} from '../../utils/api';
import { formatDate, formatDistance } from '../../utils/format';
import { getUserKey } from '../../utils/user';
import { openProductFeedback } from '../../utils/product-feedback';
import { enableProductShareOnly, getProductHomeShare } from '../../utils/share';

const choiceLabels: Record<EventChoice, string> = {
  interested: '想跑',
  considering: '观望',
  registered: '已报名（用户自报）',
};

Page({
  data: {
    loading: true,
    error: '',
    errorRequestId: '',
    userKey: '',
    filter: '' as '' | EventChoice,
    filters: [
      { value: '', label: '全部' },
      { value: 'interested', label: '想跑' },
      { value: 'considering', label: '观望' },
      { value: 'registered', label: '已报名' },
    ],
    items: [] as Array<
      EventChoiceItem & { choiceText: string; dateText: string; distanceText: string }
    >,
  },
  onShow() {
    enableProductShareOnly();
    this.load();
  },
  async load() {
    const userKey = getUserKey();
    this.setData({ userKey, loading: true, error: '', errorRequestId: '' });
    try {
      const result = await getEventChoices(userKey, this.data.filter || undefined);
      this.setData({
        loading: false,
        items: result.items.map((item) => ({
          ...item,
          choiceText: choiceLabels[item.choice],
          dateText: item.event ? formatDate(item.event.eventDate) : '',
          distanceText: item.event ? formatDistance(item.event.distanceItems) : '',
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
  changeFilter(event: WechatMiniprogram.TouchEvent) {
    this.setData({ filter: String(event.currentTarget.dataset.value || '') });
    this.load();
  },
  openEvent(event: WechatMiniprogram.TouchEvent) {
    const eventId = String(event.currentTarget.dataset.id || '');
    if (eventId) wx.navigateTo({ url: `/pages/event-detail/index?id=${eventId}` });
  },
  removeChoice(event: WechatMiniprogram.TouchEvent) {
    const eventId = String(event.currentTarget.dataset.id || '');
    if (!eventId) return;
    wx.showModal({
      title: '清除这条选择？',
      content: '清除后赛事详情中的匿名数量会同步更新。',
      confirmText: '清除',
      success: async (result: { confirm: boolean }) => {
        if (!result.confirm) return;
        try {
          await removeEventChoice(this.data.userKey, eventId);
          wx.showToast({ title: '已清除', icon: 'success' });
          await this.load();
        } catch (error) {
          wx.showToast({ title: (error as Error).message || '清除失败', icon: 'none' });
        }
      },
    });
  },
  reload() {
    this.load();
  },
  reportProblem() {
    openProductFeedback('choices', this.data.errorRequestId || undefined);
  },
  openEvents() {
    wx.switchTab({ url: '/pages/events/index' });
  },
  onShareAppMessage() {
    return getProductHomeShare();
  },
});

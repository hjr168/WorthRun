import { cancelEventReminder, EventReminderItem, getMyReminders } from '../../utils/api';
import { ensureWechatSession } from '../../utils/account';
import { formatDate, formatDateTime } from '../../utils/format';

Page({
  data: {
    loading: true,
    error: '',
    items: [] as Array<
      EventReminderItem & { dateText: string; scheduleText: string; typeText: string }
    >,
  },
  onShow() {
    this.load();
  },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      await ensureWechatSession(true);
      const result = await getMyReminders();
      this.setData({
        items: result.items.map((item) => ({
          ...item,
          dateText: formatDate(item.event.eventDate),
          scheduleText: item.scheduledAt ? formatDateTime(item.scheduledAt) : '待官方核验报名开放',
          typeText: item.reminderType === 'signup' ? '报名提醒' : '赛前 7 天提醒',
        })),
      });
    } catch (error) {
      this.setData({ error: (error as Error).message || '提醒加载失败' });
    } finally {
      this.setData({ loading: false });
    }
  },
  cancel(event: WechatMiniprogram.TouchEvent) {
    const eventId = String(event.currentTarget.dataset.eventId || '');
    const type = String(event.currentTarget.dataset.type || '') as 'signup' | 'race_week';
    wx.showModal({
      title: '取消这条提醒？',
      confirmText: '取消提醒',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await cancelEventReminder(eventId, type);
          await this.load();
        } catch (error) {
          wx.showToast({ title: (error as Error).message || '取消失败', icon: 'none' });
        }
      },
    });
  },
  openEvent(event: WechatMiniprogram.TouchEvent) {
    wx.navigateTo({ url: `/pages/event-detail/index?id=${event.currentTarget.dataset.eventId}` });
  },
});

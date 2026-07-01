import { submitFeedback } from '../../utils/api';
import { getUserKey } from '../../utils/user';

const feedbackTypes = [
  '日期有误',
  '报名状态有误',
  '官方链接失效',
  '赛事取消 / 延期',
  '信息重复',
  '其他',
];

Page({
  data: {
    eventId: '',
    userKey: '',
    feedbackTypes,
    typeIndex: 0,
    content: '',
    submitting: false,
  },
  onLoad(query: { eventId?: string }) {
    this.setData({ eventId: query.eventId || '', userKey: getUserKey() });
  },
  onTypeChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ typeIndex: Number(event.detail.value) });
  },
  onContentInput(event: WechatMiniprogram.Input) {
    this.setData({ content: event.detail.value });
  },
  async submit() {
    if (this.data.submitting) return;
    if (!this.data.eventId) {
      wx.showToast({ title: '赛事不存在', icon: 'none' });
      return;
    }
    const content = this.data.content.trim() || feedbackTypes[this.data.typeIndex];
    this.setData({ submitting: true });
    try {
      await submitFeedback({
        eventId: this.data.eventId,
        userKey: this.data.userKey,
        feedbackType: feedbackTypes[this.data.typeIndex],
        content,
      });
      wx.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch {
      wx.showToast({ title: '反馈失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});

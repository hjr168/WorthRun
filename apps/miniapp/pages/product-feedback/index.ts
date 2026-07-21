import { ApiError, submitProductFeedback } from '../../utils/api';
import { createFeedbackRequestId, saveFeedbackReceipt } from '../../utils/feedback';
import {
  getMiniappVersion,
  type ProductFeedbackContext,
} from '../../utils/product-feedback';
import { getUserKey } from '../../utils/user';

const feedbackTypes = ['功能建议', '使用问题', '页面异常', '内容体验', '其他'];
const feedbackHints = [
  '请说明你希望增加或调整的功能',
  '请说明操作步骤和遇到的具体问题',
  '请说明哪个页面显示异常以及当时的操作',
  '请说明哪些内容不清楚、不准确或不方便阅读',
  '请具体说明你的意见或建议',
];
const contextLabels: Record<ProductFeedbackContext, string> = {
  home: '首页',
  events: '赛事列表',
  event_detail: '赛事详情',
  source_summary: '来源摘要',
  favorites: '我的收藏',
  choices: '我的选择',
  mine: '我的',
};
const contextPages = Object.keys(contextLabels) as ProductFeedbackContext[];
const contextOptions = contextPages.map((value) => ({ value, label: contextLabels[value] }));

Page({
  data: {
    userKey: '',
    requestId: '',
    contextPage: 'mine' as ProductFeedbackContext,
    contextLabel: '我的',
    contextIndex: contextPages.indexOf('mine'),
    contextOptions,
    customContextPage: '',
    relatedRequestId: '',
    appVersion: '',
    feedbackTypes,
    feedbackHints,
    typeIndex: 0,
    content: '',
    contentLength: 0,
    canSubmit: false,
    submitting: false,
    submitted: false,
    successMessage: '反馈已收到',
  },
  onLoad(query: { contextPage?: string; relatedRequestId?: string }) {
    const contextPage = contextPages.includes(query.contextPage as ProductFeedbackContext)
      ? (query.contextPage as ProductFeedbackContext)
      : 'mine';
    const relatedRequestId = /^[0-9a-f-]{36}$/i.test(query.relatedRequestId || '')
      ? String(query.relatedRequestId)
      : '';
    this.setData({
      userKey: getUserKey(),
      contextPage,
      contextLabel: contextLabels[contextPage],
      contextIndex: contextPages.indexOf(contextPage),
      relatedRequestId,
      appVersion: getMiniappVersion() || '',
    });
  },
  onTypeSelect(event: WechatMiniprogram.TouchEvent) {
    this.setData({ typeIndex: Number(event.currentTarget.dataset.index) });
  },
  onContextSelect(event: WechatMiniprogram.PickerChange) {
    const contextIndex = Number(event.detail.value);
    const option = contextOptions[contextIndex];
    if (!option) return;
    this.setData({
      contextIndex,
      contextPage: option.value,
      contextLabel: option.label,
      customContextPage: '',
    });
  },
  onContextInput(event: WechatMiniprogram.Input) {
    this.setData({ customContextPage: event.detail.value });
  },
  onContentInput(event: WechatMiniprogram.Input) {
    const content = event.detail.value;
    const contentLength = content.trim().length;
    this.setData({ content, contentLength, canSubmit: contentLength >= 6 && contentLength <= 500 });
  },
  goBack() {
    wx.navigateBack({ delta: 1 });
  },
  async submit() {
    if (this.data.submitting || !this.data.canSubmit) return;
    const requestId = this.data.requestId || createFeedbackRequestId();
    const feedbackType = feedbackTypes[this.data.typeIndex];
    const contextPage = this.data.customContextPage.trim() || this.data.contextPage;
    this.setData({ submitting: true, requestId });
    try {
      const result = await submitProductFeedback({
        userKey: this.data.userKey,
        requestId,
        feedbackType,
        content: this.data.content.trim(),
        contextPage,
        appVersion: this.data.appVersion || undefined,
        relatedRequestId: this.data.relatedRequestId || undefined,
      });
      saveFeedbackReceipt({
        scope: 'product_feedback',
        feedbackType,
        contextPage,
        createdAt: new Date().toISOString(),
        requestId,
      });
      this.setData({
        submitted: true,
        successMessage: result.duplicate ? '相同反馈已收到' : '反馈已收到',
      });
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 429) {
        const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds || 60) / 60));
        wx.showToast({ title: `提交过于频繁，请约 ${minutes} 分钟后再试`, icon: 'none' });
      } else if (error instanceof ApiError && error.statusCode === 400) {
        wx.showToast({ title: error.message || '请修改反馈内容后重试', icon: 'none' });
      } else {
        wx.showToast({ title: (error as Error).message || '反馈失败', icon: 'none' });
      }
    } finally {
      this.setData({ submitting: false });
    }
  },
});

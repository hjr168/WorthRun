import { getSourceSummary, PublicSourceSummary, recordInteraction } from '../../utils/api';
import { complianceNotice, formatDate, formatDateTime } from '../../utils/format';
import { getUserKey } from '../../utils/user';

Page({
  data: {
    eventId: '',
    userKey: '',
    loading: true,
    error: '',
    item: null as PublicSourceSummary | null,
    eventDateText: '',
    fetchedAtText: '',
    basisText: '',
    complianceNotice,
  },
  onLoad(query: { eventId?: string }) {
    this.setData({ eventId: query.eventId || '', userKey: getUserKey() });
    this.load();
  },
  async load() {
    if (!this.data.eventId) {
      this.setData({ loading: false, error: '缺少赛事信息' });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const item = await getSourceSummary(this.data.eventId);
      this.setData({
        item,
        eventDateText: formatDate(item.event.eventDate),
        fetchedAtText: formatDateTime(item.fetchedAt),
        basisText: item.basis === 'page_text' ? '来源页面正文' : '已保存来源记录',
        complianceNotice: item.complianceNotice || complianceNotice,
        loading: false,
      });
      recordInteraction({
        userKey: this.data.userKey,
        eventId: this.data.eventId,
        action: 'source_summary_view',
      }).catch(() => {});
    } catch (error) {
      this.setData({
        loading: false,
        item: null,
        error: (error as Error).message || '来源摘要加载失败',
      });
    }
  },
  reload() {
    this.load();
  },
  copySourceUrl() {
    if (!this.data.item?.sourceUrl) return;
    wx.setClipboardData({
      data: this.data.item.sourceUrl,
      success: () => {
        recordInteraction({
          userKey: this.data.userKey,
          eventId: this.data.eventId,
          action: 'source_original_link_copy',
        }).catch(() => {});
        wx.showModal({
          title: '来源链接已复制',
          content: '请在浏览器或微信中打开，并以来源原文为准。',
          showCancel: false,
          confirmText: '知道了',
        });
      },
      fail: () => wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' }),
    });
  },
  backToEvent() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: `/pages/event-detail/index?id=${this.data.eventId}` }),
    });
  },
});

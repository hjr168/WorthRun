import {
  addFavorite,
  EventDetail,
  EventChoice,
  getEventDetail,
  getEventChoice,
  getFavorites,
  recordInteraction,
  recordShare,
  removeFavorite,
  removeEventChoice,
  setEventChoice,
} from '../../utils/api';
import {
  complianceNotice,
  formatDate,
  formatDateTime,
  formatDistance,
  infoStatusLabels,
  labelOf,
  officialActionText,
} from '../../utils/format';
import { getUserKey } from '../../utils/user';
import { EventLaunchQuery, resolveEventId } from '../../utils/launch';
import { getFeedbackReceipts } from '../../utils/feedback';
import {
  buildVerificationGroups,
  getEventNotice,
  hasChoiceCounts,
  updateChoiceCounts,
} from '../../utils/event-detail';

Page({
  data: {
    id: '',
    userKey: '',
    loading: true,
    error: '',
    event: null as EventDetail | null,
    isFavorite: false,
    viewerChoice: null as EventChoice | null,
    choiceUpdating: false,
    dateText: '',
    distanceText: '',
    sourceCheckedAtText: '等待复核',
    updatedAtText: '待确认',
    eventNotice: null as { text: string; tone: string } | null,
    hasChoiceCounts: false,
    aiExpanded: false,
    infoStatusText: '待核实',
    confirmedItems: [] as string[],
    pendingItems: [] as string[],
    hasVerificationItems: false,
    hasFeedbackReceipt: false,
    complianceNotice,
    officialActionText,
  },
  onLoad(query: EventLaunchQuery) {
    this.setData({ id: resolveEventId(query), userKey: getUserKey() });
    this.load();
  },
  onShow() {
    this.refreshFeedbackReceipt();
  },
  refreshFeedbackReceipt() {
    if (!this.data.id) return;
    this.setData({
      hasFeedbackReceipt: getFeedbackReceipts().some((item) => item.eventId === this.data.id),
    });
  },
  async load() {
    if (!this.data.id) {
      this.setData({ loading: false, error: '赛事不存在或未发布' });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const [detail, favorites, viewerChoice] = await Promise.all([
        getEventDetail(this.data.id),
        getFavorites(this.data.userKey).catch(() => ({ items: [] })),
        getEventChoice(this.data.userKey, this.data.id).catch(() => ({ choice: null })),
      ]);
      const verification = buildVerificationGroups(
        detail.event.infoStatus,
        detail.event.checklistItems,
      );
      this.setData({
        event: detail.event,
        isFavorite: favorites.items.some((item) => item.eventId === this.data.id),
        viewerChoice: viewerChoice.choice,
        dateText: formatDate(detail.event.eventDate),
        distanceText: formatDistance(detail.event.distanceItems),
        sourceCheckedAtText: detail.event.sourceCheckedAt
          ? formatDateTime(detail.event.sourceCheckedAt)
          : '等待复核',
        updatedAtText: detail.event.updatedAt
          ? formatDateTime(detail.event.updatedAt)
          : '待确认',
        eventNotice: getEventNotice(detail.event),
        hasChoiceCounts: hasChoiceCounts(detail.event.choiceCounts),
        infoStatusText: labelOf(infoStatusLabels, detail.event.infoStatus),
        confirmedItems: verification.confirmedItems,
        pendingItems: verification.pendingItems,
        hasVerificationItems: verification.hasItemRecords,
        complianceNotice: detail.complianceNotice || complianceNotice,
        officialActionText: detail.officialActionText || officialActionText,
        loading: false,
      });
      this.refreshFeedbackReceipt();
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
  onChoiceTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.choiceUpdating) return;
    const choice = String(event.currentTarget.dataset.choice || '') as EventChoice;
    if (!['interested', 'considering', 'registered'].includes(choice)) return;
    if (this.data.viewerChoice === choice) {
      wx.showModal({
        title: '清除我的选择？',
        content: '清除后公开数量会同步更新。',
        confirmText: '清除',
        success: (result: { confirm: boolean }) => {
          if (result.confirm) this.clearChoice();
        },
      });
      return;
    }
    this.saveChoice(choice);
  },
  async saveChoice(choice: EventChoice) {
    if (!this.data.event || this.data.choiceUpdating) return;
    const previousChoice = this.data.viewerChoice;
    const previousCounts = { ...this.data.event.choiceCounts };
    const optimisticCounts = updateChoiceCounts(previousCounts, previousChoice, choice);
    this.setData({
      choiceUpdating: true,
      viewerChoice: choice,
      'event.choiceCounts': optimisticCounts,
      hasChoiceCounts: hasChoiceCounts(optimisticCounts),
    });
    try {
      const result = await setEventChoice(this.data.userKey, this.data.event.id, choice);
      this.setData({
        viewerChoice: result.choice,
        'event.choiceCounts': result.choiceCounts,
        hasChoiceCounts: hasChoiceCounts(result.choiceCounts),
      });
      wx.showToast({ title: '选择已更新', icon: 'success' });
    } catch (error) {
      this.setData({
        viewerChoice: previousChoice,
        'event.choiceCounts': previousCounts,
        hasChoiceCounts: hasChoiceCounts(previousCounts),
      });
      wx.showToast({ title: (error as Error).message || '更新失败', icon: 'none' });
    } finally {
      this.setData({ choiceUpdating: false });
    }
  },
  async clearChoice() {
    if (!this.data.event || this.data.choiceUpdating) return;
    const previousChoice = this.data.viewerChoice;
    const previousCounts = { ...this.data.event.choiceCounts };
    const optimisticCounts = updateChoiceCounts(previousCounts, previousChoice, null);
    this.setData({
      choiceUpdating: true,
      viewerChoice: null,
      'event.choiceCounts': optimisticCounts,
      hasChoiceCounts: hasChoiceCounts(optimisticCounts),
    });
    try {
      const result = await removeEventChoice(this.data.userKey, this.data.event.id);
      this.setData({
        viewerChoice: null,
        'event.choiceCounts': result.choiceCounts,
        hasChoiceCounts: hasChoiceCounts(result.choiceCounts),
      });
      wx.showToast({ title: '已清除', icon: 'success' });
    } catch (error) {
      this.setData({
        viewerChoice: previousChoice,
        'event.choiceCounts': previousCounts,
        hasChoiceCounts: hasChoiceCounts(previousCounts),
      });
      wx.showToast({ title: (error as Error).message || '清除失败', icon: 'none' });
    } finally {
      this.setData({ choiceUpdating: false });
    }
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
  toggleAiNotice() {
    this.setData({ aiExpanded: !this.data.aiExpanded });
  },
  openSourceSummary() {
    if (!this.data.event?.hasSourceSummary) return;
    recordInteraction({
      userKey: this.data.userKey,
      eventId: this.data.id,
      action: 'source_summary_open',
    }).catch(() => {});
    wx.navigateTo({ url: `/pages/source-summary/index?eventId=${this.data.id}` });
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

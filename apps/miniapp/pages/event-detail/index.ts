import {
  addFavorite,
  ApiError,
  EventDetail,
  EventChoice,
  getEventDetail,
  getEventChoice,
  getFavorites,
  getMyReminders,
  recordInteraction,
  recordActivity,
  removeFavorite,
  removeEventChoice,
  setEventChoice,
  subscribeEventReminders,
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
import { openProductFeedback } from '../../utils/product-feedback';
import { enablePublicShare, getSharePayload, trackShare } from '../../utils/share';
import { ensureWechatSession } from '../../utils/account';
import { config } from '../../config/index';

Page({
  data: {
    id: '',
    userKey: '',
    loading: true,
    error: '',
    errorRequestId: '',
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
    reminderUpdating: '',
    reminderSubscribed: { signup: false, race_week: false },
  },
  onLoad(query: EventLaunchQuery) {
    enablePublicShare();
    this.setData({ id: resolveEventId(query), userKey: getUserKey() });
    this.load();
    if (query.shareToken) {
      ensureWechatSession()
        .then((profile) =>
          profile
            ? recordActivity({
                entryPage: 'event_detail',
                channel: 'share',
                referralShareToken: query.shareToken,
              })
            : undefined,
        )
        .catch(() => {});
    }
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
    this.setData({ loading: true, error: '', errorRequestId: '' });
    try {
      const [detail, favorites, viewerChoice, reminderResult] = await Promise.all([
        getEventDetail(this.data.id),
        getFavorites(this.data.userKey).catch(() => ({ items: [] })),
        getEventChoice(this.data.userKey, this.data.id).catch(() => ({ choice: null })),
        getMyReminders().catch(() => ({ items: [] })),
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
        updatedAtText: detail.event.updatedAt ? formatDateTime(detail.event.updatedAt) : '待确认',
        eventNotice: getEventNotice(detail.event),
        hasChoiceCounts: hasChoiceCounts(detail.event.choiceCounts),
        infoStatusText: labelOf(infoStatusLabels, detail.event.infoStatus),
        confirmedItems: verification.confirmedItems,
        pendingItems: verification.pendingItems,
        hasVerificationItems: verification.hasItemRecords,
        complianceNotice: detail.complianceNotice || complianceNotice,
        officialActionText: detail.officialActionText || officialActionText,
        reminderSubscribed: {
          signup: reminderResult.items.some(
            (item) => item.eventId === detail.event.id && item.reminderType === 'signup',
          ),
          race_week: reminderResult.items.some(
            (item) => item.eventId === detail.event.id && item.reminderType === 'race_week',
          ),
        },
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
        errorRequestId: error instanceof ApiError ? error.requestId || '' : '',
      });
    }
  },
  reload() {
    this.load();
  },
  reportProblem() {
    openProductFeedback('event_detail', this.data.errorRequestId || undefined);
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
  async subscribeReminder(event: WechatMiniprogram.TouchEvent) {
    const type = String(event.currentTarget.dataset.type || '') as 'signup' | 'race_week';
    if (!this.data.event || this.data.reminderUpdating || this.data.reminderSubscribed[type])
      return;
    const option = this.data.event.reminderOptions?.find((item) => item.type === type);
    if (!option?.available) {
      wx.showToast({ title: option?.reason || '当前暂无可用提醒', icon: 'none' });
      return;
    }
    const templateId = config.reminderTemplateIds[type];
    if (!templateId) {
      wx.showToast({ title: '提醒功能正在灰度开放', icon: 'none' });
      return;
    }
    this.setData({ reminderUpdating: type });
    try {
      const profile = await ensureWechatSession(true);
      if (!profile) throw new Error('请稍后重试微信登录');
      const permission = await new Promise<Record<string, string>>((resolve, reject) => {
        wx.requestSubscribeMessage({ tmplIds: [templateId], success: resolve, fail: reject });
      });
      if (permission[templateId] !== 'accept') throw new Error('需先允许本次消息提醒');
      await subscribeEventReminders(this.data.event.id, [type]);
      this.setData({ [`reminderSubscribed.${type}`]: true });
      wx.showToast({ title: '提醒已开启', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: (error as Error).message || '开启提醒失败', icon: 'none' });
    } finally {
      this.setData({ reminderUpdating: '' });
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
  async onShareAppMessage() {
    const event = this.data.event;
    const tracked = await trackShare('page_share', 'event_detail', event?.id, true);
    if (!event) return getSharePayload('home', '/pages/home/index');
    return getSharePayload(
      'event_detail',
      `/pages/event-detail/index?id=${event.id}${tracked.shareToken ? `&shareToken=${tracked.shareToken}` : ''}`,
      {
        eventName: event.eventName,
        city: event.city,
        eventDate: event.eventDate,
        distance: event.distanceItems.join('、'),
        judgement: event.runJudgement,
      },
      event.resolvedShare,
    );
  },
  onShareTimeline() {
    const event = this.data.event;
    trackShare('timeline_share', 'event_detail', event?.id);
    const payload = event
      ? getSharePayload(
          'event_detail',
          `/pages/event-detail/index?id=${event.id}`,
          {
            eventName: event.eventName,
            city: event.city,
            eventDate: event.eventDate,
            distance: event.distanceItems.join('、'),
            judgement: event.runJudgement,
          },
          event.resolvedShare,
        )
      : getSharePayload('home', '/pages/home/index');
    return {
      title: payload.title,
      query: event ? `id=${event.id}` : '',
      imageUrl: payload.imageUrl,
    };
  },
});

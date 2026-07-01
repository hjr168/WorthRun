import {
  addFavorite,
  EventSummary,
  getEvents,
  getFavorites,
  removeFavorite,
} from '../../utils/api';
import { getUserKey } from '../../utils/user';

const cities = ['全部', '广州', '深圳', '佛山', '东莞', '珠海', '中山', '惠州', '香港', '澳门'];
const distances = ['全部', '5K', '10K', '半马', '全马', '欢乐跑'];
const signupOptions = [
  { label: '全部', value: '' },
  { label: '报名中', value: 'signup_open' },
  { label: '即将截止', value: 'closing_soon' },
  { label: '未开始', value: 'not_started' },
  { label: '已截止', value: 'closed' },
  { label: '待核实', value: 'unknown' },
];
const judgementOptions = [
  { label: '全部', value: '' },
  { label: '优先关注', value: 'priority' },
  { label: '可以观望', value: 'watch' },
  { label: '待核实', value: 'unverified' },
];

Page({
  data: {
    loading: true,
    error: '',
    userKey: '',
    search: '',
    cityIndex: 0,
    distanceIndex: 0,
    signupIndex: 0,
    judgementIndex: 0,
    cities,
    distances,
    signupLabels: signupOptions.map((item) => item.label),
    judgementLabels: judgementOptions.map((item) => item.label),
    events: [] as EventSummary[],
    page: 1,
    pageSize: 10,
    total: 0,
    hasMore: true,
    loadingMore: false,
  },
  onShow() {
    this.load(true);
  },
  async load(reset = false) {
    const userKey = getUserKey();
    if (this.data.loadingMore || (!reset && !this.data.hasMore)) return;
    const page = reset ? 1 : this.data.page + 1;
    this.setData({
      loading: reset,
      loadingMore: !reset,
      error: '',
      userKey,
      page,
      ...(reset ? { events: [], hasMore: true, total: 0 } : {}),
    });
    try {
      const params = {
        page,
        pageSize: this.data.pageSize,
        search: this.data.search,
        city: this.data.cityIndex ? cities[this.data.cityIndex] : '',
        distance: this.data.distanceIndex ? distances[this.data.distanceIndex] : '',
        signupStatus: signupOptions[this.data.signupIndex].value,
        runJudgement: judgementOptions[this.data.judgementIndex].value,
      };
      const [eventRes, favoriteRes] = await Promise.all([
        getEvents(params),
        getFavorites(userKey).catch(() => ({ items: [] })),
      ]);
      const favoriteIds = new Set(favoriteRes.items.map((item) => item.eventId));
      const nextEvents = eventRes.items.map((item) => ({ ...item, isFavorite: favoriteIds.has(item.id) }));
      const events = reset ? nextEvents : [...this.data.events, ...nextEvents];
      this.setData({
        loading: false,
        loadingMore: false,
        total: eventRes.total,
        hasMore: events.length < eventRes.total,
        events,
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadingMore: false,
        error: reset ? (error as Error).message || '网络异常' : this.data.error,
      });
      wx.showToast({ title: reset ? '网络异常' : '加载失败', icon: 'none' });
    }
  },
  onReachBottom() {
    if (!this.data.hasMore) {
      wx.showToast({ title: '没有更多了', icon: 'none' });
      return;
    }
    this.load(false);
  },
  onSearch(event: WechatMiniprogram.Input) {
    this.setData({ search: event.detail.value });
  },
  submitSearch() {
    this.load(true);
  },
  onCityChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ cityIndex: Number(event.detail.value) });
    this.load(true);
  },
  onDistanceChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ distanceIndex: Number(event.detail.value) });
    this.load(true);
  },
  onSignupChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ signupIndex: Number(event.detail.value) });
    this.load(true);
  },
  onJudgementChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ judgementIndex: Number(event.detail.value) });
    this.load(true);
  },
  openEvent(event: WechatMiniprogram.CustomEvent) {
    wx.navigateTo({ url: `/pages/event-detail/index?id=${event.detail.id}` });
  },
  async toggleFavorite(event: WechatMiniprogram.CustomEvent) {
    const { id, isFavorite } = event.detail;
    try {
      if (isFavorite) {
        await removeFavorite(this.data.userKey, id);
        wx.showToast({ title: '已取消收藏', icon: 'success' });
      } else {
        await addFavorite(this.data.userKey, id);
        wx.showToast({ title: '收藏成功', icon: 'success' });
      }
      this.load(true);
    } catch {
      wx.showToast({ title: isFavorite ? '取消收藏失败' : '收藏失败', icon: 'none' });
    }
  },
});

import {
  addFavorite,
  EventSummary,
  getEvents,
  getFavorites,
  removeFavorite,
} from '../../utils/api';
import { getUserKey } from '../../utils/user';

const cities = ['全部', '广州', '深圳', '佛山', '东莞', '珠海'];
const distances = ['全部', '5K', '10K', '15K', '半马', '全马'];
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
  },
  onShow() {
    this.load();
  },
  async load() {
    const userKey = getUserKey();
    this.setData({ loading: true, error: '', userKey });
    try {
      const params = {
        page: 1,
        pageSize: 30,
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
      this.setData({
        loading: false,
        events: eventRes.items.map((item) => ({ ...item, isFavorite: favoriteIds.has(item.id) })),
      });
    } catch (error) {
      this.setData({ loading: false, error: (error as Error).message || '网络异常' });
    }
  },
  onSearch(event: WechatMiniprogram.Input) {
    this.setData({ search: event.detail.value });
  },
  submitSearch() {
    this.load();
  },
  onCityChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ cityIndex: Number(event.detail.value) });
    this.load();
  },
  onDistanceChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ distanceIndex: Number(event.detail.value) });
    this.load();
  },
  onSignupChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ signupIndex: Number(event.detail.value) });
    this.load();
  },
  onJudgementChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ judgementIndex: Number(event.detail.value) });
    this.load();
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
      this.load();
    } catch {}
  },
});

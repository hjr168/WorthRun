import {
  addFavorite,
  ApiError,
  EventSummary,
  getEvents,
  getFavorites,
  removeFavorite,
} from '../../utils/api';
import { getUserKey } from '../../utils/user';
import { openProductFeedback } from '../../utils/product-feedback';
import { enablePublicShare, getSharePayload, trackShare } from '../../utils/share';

const cities = [
  '全部',
  '北京', '上海',
  '南京', '无锡', '徐州', '常州', '苏州', '南通', '连云港', '淮安', '盐城', '扬州', '镇江', '泰州', '宿迁',
  '杭州', '宁波', '温州', '嘉兴', '湖州', '绍兴', '金华', '衢州', '舟山', '台州', '丽水',
  '广州',
  '深圳',
  '珠海',
  '佛山',
  '惠州',
  '东莞',
  '中山',
  '江门',
  '肇庆',
  '汕头', '湛江', '茂名', '梅州', '汕尾', '河源', '阳江', '清远', '潮州', '揭阳', '云浮',
  '成都', '自贡', '攀枝花', '泸州', '德阳', '绵阳', '广元', '遂宁', '内江', '乐山', '南充', '眉山', '宜宾', '广安', '达州', '雅安', '巴中', '资阳', '阿坝', '甘孜', '凉山',
  '重庆', '武汉', '黄石', '十堰', '宜昌', '襄阳', '鄂州', '荆门', '孝感', '荆州', '黄冈', '咸宁', '随州', '恩施', '神农架',
  '福州', '厦门', '莆田', '三明', '泉州', '漳州', '南平', '龙岩', '宁德',
  '香港',
  '澳门',
];
const months = ['全部月份', ...Array.from({ length: 12 }, (_, index) => {
  const date = new Date();
  date.setMonth(date.getMonth() + index);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
})];
const distances = ['全部', '5K', '10K', '半马', '全马', '欢乐跑'];
const signupOptions = [
  { label: '全部', value: '' },
  { label: '报名中', value: 'signup_open' },
  { label: '即将截止', value: 'closing_soon' },
  { label: '即将开放', value: 'not_started' },
  { label: '报名已截止', value: 'closed' },
  { label: '待确认', value: 'unknown' },
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
    errorRequestId: '',
    userKey: '',
    search: '',
    cityIndex: 0,
    distanceIndex: 0,
    signupIndex: 0,
    judgementIndex: 0,
    monthIndex: 0,
    filtersExpanded: false,
    cities,
    distances,
    signupLabels: signupOptions.map((item) => item.label),
    judgementLabels: judgementOptions.map((item) => item.label),
    months,
    events: [] as EventSummary[],
    page: 1,
    pageSize: 10,
    total: 0,
    hasMore: true,
    loadingMore: false,
    didInitialLoad: false,
    activeFilterText: '全部未来赛事',
    resultText: '',
    searchFocused: false,
    hasActiveFilter: false,
  },
  onLoad() {
    enablePublicShare();
    this.load(true);
  },
  onShow() {
    if (wx.getStorageSync('worthrun_focus_event_search')) {
      wx.removeStorageSync('worthrun_focus_event_search');
      this.setData({ searchFocused: true });
      setTimeout(() => this.setData({ searchFocused: false }), 500);
    }
    if (!this.data.didInitialLoad) return;
    // 从详情页返回时，列表已加载过：仅静默刷新收藏状态，不重置第一页，
    // 避免丢失已加载的后续分页与滚动位置。
    this.refreshFavoriteFlags();
  },
  /** 仅重新拉取收藏全集并更新当前已加载列表的 isFavorite 标记。 */
  async refreshFavoriteFlags() {
    try {
      const favoriteRes = await getFavorites(this.data.userKey).catch(() => ({ items: [] }));
      const favoriteIds = new Set(favoriteRes.items.map((item) => item.eventId));
      const events = this.data.events.map((item) => ({ ...item, isFavorite: favoriteIds.has(item.id) }));
      this.setData({ events });
    } catch {
      // 收藏状态刷新失败不影响已展示的列表。
    }
  },
  async load(reset = false) {
    const userKey = getUserKey();
    if (!reset && (this.data.loadingMore || !this.data.hasMore)) return;
    const page = reset ? 1 : this.data.page + 1;
    this.setData({
      loading: reset,
      loadingMore: !reset,
      error: '',
      errorRequestId: '',
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
        month: this.data.monthIndex ? months[this.data.monthIndex] : '',
      };
      const activeFilters = [
        this.data.search.trim() ? `搜索：${this.data.search.trim()}` : '',
        this.data.cityIndex ? cities[this.data.cityIndex] : '',
        this.data.distanceIndex ? distances[this.data.distanceIndex] : '',
        this.data.signupIndex ? signupOptions[this.data.signupIndex].label : '',
        this.data.judgementIndex ? judgementOptions[this.data.judgementIndex].label : '',
        this.data.monthIndex ? months[this.data.monthIndex] : '',
      ].filter(Boolean);
      const [eventRes, favoriteRes] = await Promise.all([
        getEvents(params),
        getFavorites(userKey).catch(() => ({ items: [] })),
      ]);
      const favoriteIds = new Set(favoriteRes.items.map((item) => item.eventId));
      const nextEvents = eventRes.items.map((item) => ({
        ...item,
        isFavorite: favoriteIds.has(item.id),
      }));
      const events = reset ? nextEvents : [...this.data.events, ...nextEvents];
      this.setData({
        loading: false,
        loadingMore: false,
        didInitialLoad: true,
        total: eventRes.total,
        resultText: `找到 ${eventRes.total} 场赛事`,
        activeFilterText: activeFilters.join(' · ') || '全部未来赛事',
        hasActiveFilter: activeFilters.length > 0,
        hasMore: events.length < eventRes.total,
        events,
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadingMore: false,
        didInitialLoad: true,
        error: reset ? (error as Error).message || '网络异常' : this.data.error,
        errorRequestId:
          reset && error instanceof ApiError ? error.requestId || '' : this.data.errorRequestId,
      });
      wx.showToast({ title: reset ? '网络异常' : '加载失败', icon: 'none' });
    }
  },
  reload() {
    this.load(true);
  },
  reportProblem() {
    openProductFeedback('events', this.data.errorRequestId || undefined);
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
  resetFilters() {
    this.setData({
      search: '',
      cityIndex: 0,
      distanceIndex: 0,
      signupIndex: 0,
      judgementIndex: 0,
      monthIndex: 0,
      hasActiveFilter: false,
    });
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
  onMonthChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ monthIndex: Number(event.detail.value) });
    this.load(true);
  },
  toggleFilters() {
    this.setData({ filtersExpanded: !this.data.filtersExpanded });
  },
  openEvent(event: WechatMiniprogram.CustomEvent) {
    wx.navigateTo({ url: `/pages/event-detail/index?id=${event.detail.id}` });
  },
  async toggleFavorite(event: WechatMiniprogram.CustomEvent) {
    const { id, isFavorite } = event.detail;
    // 乐观更新：本地立即翻转，避免整页重拉（否则会丢失已加载的分页与滚动位置）。
    this.setFavoriteLocally(id, !isFavorite);
    try {
      if (isFavorite) {
        await removeFavorite(this.data.userKey, id);
        wx.showToast({ title: '已取消收藏', icon: 'success' });
      } else {
        await addFavorite(this.data.userKey, id);
        wx.showToast({ title: '收藏成功', icon: 'success' });
      }
    } catch {
      this.setFavoriteLocally(id, isFavorite);
      wx.showToast({ title: isFavorite ? '取消收藏失败' : '收藏失败', icon: 'none' });
    }
  },
  /** 翻转当前已加载列表中某场赛事的 isFavorite 标记。 */
  setFavoriteLocally(eventId: string, favorite: boolean) {
    const index = this.data.events.findIndex((item) => item.id === eventId);
    if (index >= 0) this.setData({ [`events[${index}].isFavorite`]: favorite });
  },
  onShareAppMessage() {
    trackShare('page_share', 'events');
    return getSharePayload('events', '/pages/events/index');
  },
  onShareTimeline() {
    trackShare('timeline_share', 'events');
    const payload = getSharePayload('events', '/pages/events/index');
    return { title: payload.title, imageUrl: payload.imageUrl };
  },
});

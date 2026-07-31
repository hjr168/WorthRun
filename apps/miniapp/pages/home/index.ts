import {
  addFavorite,
  ApiError,
  DiscoveryHomeResponse,
  EventSummary,
  getDiscoveryHome,
  getFavorites,
  getPreference,
  Preference,
  removeFavorite,
} from '../../utils/api';
import { getUserKey } from '../../utils/user';
import { isCacheFresh, swr, writeCache } from '../../utils/cache';
import { openProductFeedback } from '../../utils/product-feedback';
import { enablePublicShare, getSharePayload, trackShare } from '../../utils/share';
import { formatDate } from '../../utils/format';

function monthOffset(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
}
function monthTabItems() {
  return [1, 2, 3, 4].map((offset) => { const value = monthOffset(offset); return { value, label: `${value.slice(5)}月` }; });
}

const DEFAULT_EVENT_COVER = '/assets/images/event-cover-default.png';

/** 首页缓存 key 需带上月份，避免切换月份时复用到旧数据。 */
function homeCacheKey(month: string) {
  return `home:${month}`;
}
const HOME_CACHE_KEY = homeCacheKey('');

function coverUrl(value?: string | null) {
  return value && !value.endsWith('event-cover-default.jpg') ? value : DEFAULT_EVENT_COVER;
}

function decorate(items: EventSummary[], favoriteIds: Set<string>) {
  return items.map((item) => ({
    ...item,
    coverImageUrl: coverUrl(item.coverImageUrl),
    coverThumbnailUrl: coverUrl(item.coverThumbnailUrl || item.coverImageUrl),
    isFavorite: favoriteIds.has(item.id),
    dateText: formatDate(item.eventDate),
    signupStartAtText: formatDate(item.signupStartAt),
    distanceText: item.distanceItems.join(' · '),
  }));
}

Page({
  data: {
    loading: true,
    error: '',
    errorRequestId: '',
    userKey: '',
    preference: null as Preference | null,
    preferenceText: '',
    month: monthOffset(3),
    monthTabs: monthTabItems(),
    focusEvents: [] as EventSummary[],
    editorsPicks: [] as EventSummary[],
    signupSoon: [] as EventSummary[],
    recommended: [] as EventSummary[],
  },
  onLoad() { enablePublicShare(); },
  onShow() {
    // 首次进入（loading 仍为初始 true）必须加载；之后切回 Tab 时，缓存新鲜期内直接复用。
    if (this.data.loading) { this.load(); return; }
    if (isCacheFresh(homeCacheKey(this.data.month))) return;
    this.load();
  },
  async load() {
    const userKey = getUserKey();
    // favoriteIds 以数组形式缓存（JSON 序列化友好），使用时转成 Set。
    // 直接缓存 Set 会被 wx.setStorage 序列化成空对象 {}，导致 favoriteIds.has 报错。
    const toFavoriteSet = (ids: unknown): Set<string> =>
      ids instanceof Set ? ids : new Set(Array.isArray(ids) ? ids : []);
    const applyResult = (payload: { preference: Preference | null; favoriteIds: string[]; result: DiscoveryHomeResponse }) => {
      const { preference, result } = payload;
      const favoriteIds = toFavoriteSet(payload.favoriteIds);
      this.setData({
        userKey,
        preference,
        preferenceText: preference ? `${preference.cities.join('、') || '地区不限'} · ${preference.distances.join('、') || '距离不限'}` : '',
        focusEvents: decorate(result.focusEvents, favoriteIds),
        editorsPicks: decorate(result.editorsPicks, favoriteIds),
        signupSoon: decorate(result.signupSoon, favoriteIds),
        recommended: decorate(result.recommended, favoriteIds),
        loading: false,
        error: '',
        errorRequestId: '',
      });
    };
    const cacheKey = homeCacheKey(this.data.month);
    // SWR：有缓存先用缓存秒开，后台静默刷新；无缓存则显示 loading 等待网络。
    const openedFromCache = swr<{ preference: Preference | null; favoriteIds: string[]; result: DiscoveryHomeResponse }>({
      key: cacheKey,
      loader: async () => {
        const preference = await getPreference(userKey).catch(() => null);
        const favorites = await getFavorites(userKey).catch(() => ({ items: [] }));
        const result = await getDiscoveryHome(this.data.month, userKey);
        // 用数组保存，避免 Set 被序列化丢失类型。
        return { preference, favoriteIds: favorites.items.map((item) => item.eventId), result };
      },
      onData: (data, source) => {
        applyResult(data);
        if (source === 'network') writeCache(cacheKey, data);
      },
      onError: (error) => {
        this.setData({ loading: false, error: (error as Error).message || '网络异常', errorRequestId: error instanceof ApiError ? error.requestId || '' : '' });
      },
    });
    if (!openedFromCache) this.setData({ loading: true });
  },
  selectMonth(event: WechatMiniprogram.CustomEvent) {
    const month = event.currentTarget.dataset.month as string;
    this.setData({ month });
    this.load();
  },
  reload() { this.load(); },
  reportProblem() { openProductFeedback('home', this.data.errorRequestId || undefined); },
  openPreference() { wx.navigateTo({ url: '/pages/preferences/index' }); },
  openEvents() { wx.switchTab({ url: '/pages/events/index' }); },
  openRadar() { wx.switchTab({ url: '/pages/radar/index' }); },
  openRegion() { wx.showToast({ title: '当前浏览范围：全国', icon: 'none' }); },
  openEvent(event: WechatMiniprogram.CustomEvent) {
    const id = event.detail?.id || event.currentTarget?.dataset?.id;
    if (id) wx.navigateTo({ url: `/pages/event-detail/index?id=${id}` });
  },
  onFocusImageError(event: WechatMiniprogram.CustomEvent) {
    const index = Number(event.currentTarget.dataset.index ?? 0);
    this.setData({ [`focusEvents[${index}].coverImageUrl`]: DEFAULT_EVENT_COVER });
  },
  onEditorImageError(event: WechatMiniprogram.CustomEvent) {
    this.setData({ [`editorsPicks[${Number(event.currentTarget.dataset.index)}].coverThumbnailUrl`]: DEFAULT_EVENT_COVER });
  },
  onRecommendedImageError(event: WechatMiniprogram.CustomEvent) {
    this.setData({ [`recommended[${Number(event.currentTarget.dataset.index)}].coverThumbnailUrl`]: DEFAULT_EVENT_COVER });
  },
  async toggleFavorite(event: WechatMiniprogram.CustomEvent) {
    const { id, isFavorite } = event.detail;
    // 乐观更新：本地立即翻转收藏状态，避免整页重拉。
    if (isFavorite) this.setFavoriteLocally(id, false);
    else this.setFavoriteLocally(id, true);
    try {
      if (isFavorite) await removeFavorite(this.data.userKey, id);
      else await addFavorite(this.data.userKey, id);
    } catch {
      // 失败时回滚并提示。
      this.setFavoriteLocally(id, isFavorite);
      wx.showToast({ title: isFavorite ? '取消收藏失败' : '收藏失败', icon: 'none' });
    }
  },
  /** 在首页四个分组的本地数据中翻转某场赛事的 isFavorite 标记。 */
  setFavoriteLocally(eventId: string, favorite: boolean) {
    const groups: Array<[keyof typeof this.data, EventSummary[]]> = [
      ['focusEvents', this.data.focusEvents],
      ['editorsPicks', this.data.editorsPicks],
      ['signupSoon', this.data.signupSoon],
      ['recommended', this.data.recommended],
    ];
    for (const [key, items] of groups) {
      const index = items.findIndex((item) => item.id === eventId);
      if (index >= 0) this.setData({ [`${String(key)}[${index}].isFavorite`]: favorite });
    }
  },
  onShareAppMessage() { trackShare('page_share', 'home'); return getSharePayload('home', '/pages/home/index'); },
  onShareTimeline() { trackShare('timeline_share', 'home'); const payload = getSharePayload('home', '/pages/home/index'); return { title: payload.title, imageUrl: payload.imageUrl }; },
});

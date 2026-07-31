import {
  ApiError,
  getRadar,
  RadarEventSummary,
  RadarResponse,
  recordVisitorActivity,
} from '../../utils/api';
import { getUserKey } from '../../utils/user';
import {
  buildRadarQuery,
  hasNoPreferences,
  radarTotalCount,
  toDisplayGroups,
  type RadarDisplayGroup,
} from '../../utils/radar';
import { enablePublicShare, getSharePayload, trackShare } from '../../utils/share';

const cityOptions = ['北京', '上海', '广州', '深圳', '杭州', '成都', '重庆', '武汉', '厦门', '西安', '香港', '澳门'];
const distanceOptions = ['5K', '10K', '半马', '全马', '欢乐跑'];
const focusOptions = ['新手友好', '交通方便', '风景路线', '适合 PB', '周末可去', '信息完整'];

function makeChips(options: string[], selected: string[]) {
  return options.map((label) => ({ label, selected: selected.includes(label) }));
}

interface PageData {
  loading: boolean;
  error: string;
  errorRequestId: string;
  userKey: string;
  cities: string[];
  distances: string[];
  focusTags: string[];
  cityChips: { label: string; selected: boolean }[];
  distanceChips: { label: string; selected: boolean }[];
  focusChips: { label: string; selected: boolean }[];
  generatedAt: string;
  windowDays: number;
  totalCount: number;
  displayGroups: RadarDisplayGroup[];
  showNoPrefHint: boolean;
  complianceNotice: string;
  officialActionText: string;
}

Page({
  data: {
    loading: true,
    error: '',
    errorRequestId: '',
    userKey: '',
    cities: [],
    distances: [],
    focusTags: [],
    cityChips: makeChips(cityOptions, []),
    distanceChips: makeChips(distanceOptions, []),
    focusChips: makeChips(focusOptions, []),
    generatedAt: '',
    windowDays: 90,
    totalCount: 0,
    displayGroups: [] as RadarDisplayGroup[],
    showNoPrefHint: false,
    complianceNotice: 'AI 整理，仅供参考，报名以官方为准。',
    officialActionText: '前往官方确认',
  } as PageData,
  onLoad(query: Record<string, string>) {
    enablePublicShare();
    // 支持分享路径携带的 campaign / cities / distances 参数贯穿首日行为
    const campaign = query.campaign || query.campaignCode || '';
    const initialCities = query.cities ? query.cities.split(',').filter(Boolean) : [];
    const initialDistances = query.distances ? query.distances.split(',').filter(Boolean) : [];
    this.setData({
      cities: initialCities,
      distances: initialDistances,
      cityChips: makeChips(cityOptions, initialCities),
      distanceChips: makeChips(distanceOptions, initialDistances),
      // campaign 存到 data 供 load/埋点使用（不写入 data 以避免渲染，用实例字段）
    });
    (this as unknown as { campaign: string }).campaign = campaign;
    this.load();
  },
  onShow() {
    // 仅在已加载过时刷新（避免 onLoad 重复加载）
    if (!this.data.loading && this.data.generatedAt) this.load();
  },
  async load() {
    const userKey = getUserKey();
    const instance = this as unknown as { campaign?: string };
    this.setData({ loading: true, error: '', errorRequestId: '', userKey });
    try {
      const params = buildRadarQuery({
        cities: this.data.cities,
        distances: this.data.distances,
        focusTags: this.data.focusTags,
        windowDays: this.data.windowDays,
        campaign: instance.campaign,
      });
      const response: RadarResponse = await getRadar(params);
      const displayGroups = toDisplayGroups(response).map((group) => ({
        ...group,
        // 把匹配理由映射到 event-card 读取的 judgementReasons，badges 映射到 tags，复用现有卡片渲染
        items: group.items.map((item) => ({
          ...item,
          judgementReasons: item.matchReasons && item.matchReasons.length ? item.matchReasons : [],
          tags: item.badges || [],
        })),
      }));
      this.setData({
        loading: false,
        generatedAt: response.generatedAt,
        totalCount: radarTotalCount(response),
        displayGroups,
        showNoPrefHint: hasNoPreferences(response.filters),
        complianceNotice: response.complianceNotice,
        officialActionText: response.officialActionText,
      });
      // 页面真正渲染成功后才发送 viewed_radar（交接文档 §8.2）
      this.recordViewedRadar();
    } catch (error) {
      this.setData({
        loading: false,
        error: (error as Error).message || '网络异常',
        errorRequestId: error instanceof ApiError ? error.requestId || '' : '',
      });
      wx.showToast({ title: '雷达加载失败', icon: 'none' });
    }
  },
  recordViewedRadar() {
    const instance = this as unknown as { campaign?: string };
    recordVisitorActivity({
      userKey: this.data.userKey,
      action: 'viewed_radar',
      entryPage: 'radar',
      campaign: instance.campaign,
    }).catch(() => {
      // 埋点失败不阻塞
    });
  },
  toggleChip(event: WechatMiniprogram.TouchEvent) {
    const { group, value } = event.currentTarget.dataset as { group: string; value: string };
    const key = group as 'cities' | 'distances' | 'focusTags';
    const current = (this.data[key] || []) as string[];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    const patch: Record<string, unknown> = { [group]: next };
    if (group === 'cities') patch.cityChips = makeChips(cityOptions, next);
    if (group === 'distances') patch.distanceChips = makeChips(distanceOptions, next);
    if (group === 'focusTags') patch.focusChips = makeChips(focusOptions, next);
    this.setData(patch);
  },
  applyFilters() {
    this.load();
  },
  clearFilters() {
    this.setData({
      cities: [],
      distances: [],
      focusTags: [],
      cityChips: makeChips(cityOptions, []),
      distanceChips: makeChips(distanceOptions, []),
      focusChips: makeChips(focusOptions, []),
    });
    this.load();
  },
  openEvent(event: WechatMiniprogram.CustomEvent) {
    wx.navigateTo({ url: `/pages/event-detail/index?id=${event.detail.id}` });
  },
  openPreference() {
    wx.navigateTo({ url: '/pages/preferences/index' });
  },
  reload() {
    this.load();
  },
  onShareAppMessage() {
    const instance = this as unknown as { campaign?: string };
    trackShare('page_share', 'radar');
    const citiesParam = this.data.cities.length ? `&cities=${this.data.cities.join(',')}` : '';
    const distancesParam = this.data.distances.length
      ? `&distances=${this.data.distances.join(',')}`
      : '';
    const campaignParam = instance.campaign ? `&campaign=${instance.campaign}` : '';
    const path = `/pages/radar/index?${[citiesParam, distancesParam, campaignParam]
      .filter(Boolean)
      .join('')
      .slice(1)}`;
    return getSharePayload('radar', path);
  },
  onShareTimeline() {
    trackShare('timeline_share', 'radar');
    const payload = this.onShareAppMessage();
    return { title: payload.title, imageUrl: payload.imageUrl };
  },
});

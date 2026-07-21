import { ApiError, getLatestReleaseNote, getReleaseNotes, ReleaseNoteItem } from '../../utils/api';
import { formatDateTime } from '../../utils/format';
import { markReleaseRead } from '../../utils/release-notes';
import { enablePublicShare, getSharePayload, trackShare } from '../../utils/share';
import { openProductFeedback } from '../../utils/product-feedback';

const categoryLabels = { feature: '新功能', improvement: '体验优化', fix: '问题修复' };

Page({
  data: {
    loading: true,
    loadingMore: false,
    error: '',
    errorRequestId: '',
    items: [] as Array<
      ReleaseNoteItem & {
        releasedAtText: string;
        displayChanges: Array<ReleaseNoteItem['changes'][number] & { categoryLabel: string }>;
      }
    >,
    nextCursor: '' as string,
    hasMore: false,
    latestVersion: '',
  },
  onLoad() {
    enablePublicShare();
    this.load(true);
  },
  async load(reset = false) {
    if (!reset && (this.data.loadingMore || !this.data.hasMore)) return;
    this.setData({ loading: reset, loadingMore: !reset, error: '', errorRequestId: '' });
    try {
      const [result, latest] = await Promise.all([
        getReleaseNotes(reset ? undefined : this.data.nextCursor, 10),
        reset
          ? getLatestReleaseNote().catch(() => ({ item: null }))
          : Promise.resolve({ item: null }),
      ]);
      const mapped = result.items.map((item) => ({
        ...item,
        releasedAtText: formatDateTime(item.releasedAt),
        displayChanges: item.changes.map((change) => ({
          ...change,
          categoryLabel: categoryLabels[change.category],
        })),
      }));
      const items = reset ? mapped : [...this.data.items, ...mapped];
      const latestVersion = items[0]?.version || '';
      this.setData({
        items,
        loading: false,
        loadingMore: false,
        nextCursor: result.nextCursor || '',
        hasMore: Boolean(result.nextCursor),
        latestVersion,
      });
      if (reset && latest.item?.id) markReleaseRead(latest.item.id);
    } catch (error) {
      this.setData({
        loading: false,
        loadingMore: false,
        error: (error as Error).message || '更新日志加载失败',
        errorRequestId: error instanceof ApiError ? error.requestId || '' : '',
      });
    }
  },
  loadMore() {
    this.load(false);
  },
  reload() {
    this.load(true);
  },
  reportProblem() {
    openProductFeedback('mine', this.data.errorRequestId || undefined);
  },
  onShareAppMessage() {
    trackShare('page_share', 'release_notes');
    return getSharePayload('release_notes', '/pages/release-notes/index', {
      latestVersion: this.data.latestVersion || '最新版',
    });
  },
  onShareTimeline() {
    trackShare('timeline_share', 'release_notes');
    const payload = getSharePayload('release_notes', '/pages/release-notes/index', {
      latestVersion: this.data.latestVersion || '最新版',
    });
    return { title: payload.title, imageUrl: payload.imageUrl };
  },
});

/**
 * 小程序轻量数据缓存（stale-while-revalidate）。
 *
 * 目的：赛事列表/首页等接口在切回 Tab、从详情返回等场景下避免每次都全量重拉，
 * 先用本地缓存秒开页面，再后台静默拉取最新数据替换。
 *
 * 设计：
 * - 数据写入 wx.storage（跨启动保留），同时记录写入时间戳。
 * - 读时按 TTL 判定是否新鲜：新鲜则可直接用；过期则视为 stale，但仍可先用它秒开。
 * - 提供 SWR 包装器：返回缓存（若有）+ 后台刷新，由调用方决定渲染时机。
 */

interface CacheEntry<T> {
  data: T;
  /** 写入时的 Date.now()。 */
  savedAt: number;
}

/** 默认新鲜期：缓存写入后 5 分钟内视为新鲜，可直接返回不刷新。 */
const DEFAULT_FRESH_MS = 5 * 60 * 1000;
/** 默认最大保留期：超过后视为彻底过期，不再用于秒开（视为无缓存）。 */
const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;

function storageKey(key: string) {
  return `worthrun_cache:${key}`;
}

/** 同步读取缓存，返回数据与新鲜度信息；无缓存返回 null。 */
export function readCache<T>(key: string): { data: T; fresh: boolean } | null {
  try {
    const raw = wx.getStorageSync(storageKey(key)) as CacheEntry<T> | undefined;
    if (!raw || typeof raw.savedAt !== 'number') return null;
    const age = Date.now() - raw.savedAt;
    if (age < 0 || age > DEFAULT_MAX_AGE_MS) return null;
    return { data: raw.data, fresh: age <= DEFAULT_FRESH_MS };
  } catch {
    return null;
  }
}

/** 写入缓存（静默失败不影响业务）。 */
export function writeCache<T>(key: string, data: T) {
  try {
    wx.setStorageSync(storageKey(key), { data, savedAt: Date.now() } satisfies CacheEntry<T>);
  } catch {
    // 存储满或不可用时忽略，缓存只是优化，不应阻断主流程。
  }
}

/** 清除指定缓存。 */
export function clearCache(key: string) {
  try {
    wx.removeStorageSync(storageKey(key));
  } catch {
    // ignore
  }
}

/**
 * 判定某个缓存 key 距上次成功写入是否已超过新鲜期。
 * 用于 onShow 等高频场景：新鲜期内不重复请求。
 */
export function isCacheFresh(key: string): boolean {
  return readCache(key)?.fresh === true;
}

export interface SwrOptions<T> {
  /** 缓存 key（不含前缀）。 */
  key: string;
  /** 真正拉取数据的请求。 */
  loader: () => Promise<T>;
  /**
   * 收到数据后的回调：
   * - 若有缓存，先以缓存数据调用 onFresh 完成"秒开"，随后 loader 成功再以新数据调用一次。
   * - 若无缓存，仅 loader 成功后调用一次。
   */
  onData: (data: T, source: 'cache' | 'network') => void;
  /** loader 失败时的回调（可选）。 */
  onError?: (error: unknown) => void;
}

/**
 * stale-while-revalidate：优先返回缓存完成秒开，再后台静默刷新。
 *
 * 返回值表示本次是否用缓存秒开（true=已用缓存先渲染，false=无缓存需等网络）。
 * 无论是否秒开，只要 loader 成功都会写回缓存并回调 onData('network')。
 */
export function swr<T>(options: SwrOptions<T>): boolean {
  const { key, loader, onData, onError } = options;
  const cached = readCache<T>(key);
  let openedFromCache = false;
  if (cached) {
    onData(cached.data, 'cache');
    openedFromCache = true;
    // 缓存仍新鲜时，跳过本次网络请求，避免短时间内重复拉取。
    if (cached.fresh) return openedFromCache;
  }
  loader()
    .then((data) => {
      writeCache(key, data);
      onData(data, 'network');
    })
    .catch((error) => {
      if (onError) onError(error);
    });
  return openedFromCache;
}

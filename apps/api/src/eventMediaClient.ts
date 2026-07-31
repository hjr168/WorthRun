const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * CloudBase 临时下载 URL 的有效期通常为 2 小时。这里取 90 分钟留出安全余量，
 * 避免返回即将过期的 URL；到期前命中缓存的请求都会跳过对云函数的调用，
 * 这是把"每次列表/详情请求都换签"优化为"同一 fileId 在 TTL 内只换一次"的关键。
 */
const TEMP_URL_TTL_MS = 90 * 60 * 1000;
/** 进程内缓存上限，按赛事规模估算足够覆盖热数据，超出后按写入顺序淘汰。 */
const TEMP_URL_CACHE_MAX = 2000;

type CacheEntry = { url: string; expireAt: number };

class TtlCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<string | undefined>>();

  constructor(private readonly ttlMs: number, private readonly maxEntries: number) {}

  get(key: string): string | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expireAt) {
      this.store.delete(key);
      return undefined;
    }
    // Map 的迭代顺序即写入顺序，重新插入使其成为最新使用，实现简易 LRU。
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.url;
  }

  set(key: string, url: string) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { url, expireAt: Date.now() + this.ttlMs });
  }

  /** 同一 key 并发请求时复用同一个 in-flight Promise，避免缓存击穿。 */
  async dedupe(key: string, loader: () => Promise<string | undefined>): Promise<string | undefined> {
    const cached = this.get(key);
    if (cached) return cached;
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const promise = loader()
      .then((url) => {
        if (url) this.set(key, url);
        return url;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  invalidate(key: string) {
    this.store.delete(key);
  }
}

export type EventMediaUploadResult = {
  uploaded: boolean;
  assetId: string;
  sha256: string;
  fileId: string;
  thumbnailFileId: string;
  originalFileId?: string | null;
};

export class EventMediaUnavailableError extends Error {
  constructor(message = '赛事媒体云函数尚未配置或暂不可用') {
    super(message);
    this.name = 'EventMediaUnavailableError';
  }
}

type EventMediaClientOptions = {
  baseUrl?: string;
  sharedSecret?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export class EventMediaClient {
  private readonly baseUrl: string;
  private readonly sharedSecret: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  /** 临时 URL 进程内缓存，命中时跳过云函数调用。 */
  private readonly tempUrlCache = new TtlCache(TEMP_URL_TTL_MS, TEMP_URL_CACHE_MAX);
  /** 批量换签请求的 inflight 去重表，key 为待查 fileId 拼接。 */
  private readonly inflightTempUrl = new Map<string, Promise<Map<string, string>>>();

  constructor(options: EventMediaClientOptions = {}) {
    this.baseUrl = (options.baseUrl || '').replace(/\/$/, '');
    this.sharedSecret = options.sharedSecret || '';
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  get configured() {
    return /^https:\/\//.test(this.baseUrl) && this.sharedSecret.length >= 32;
  }

  private assertConfigured() {
    if (!this.configured) throw new EventMediaUnavailableError();
  }

  private async request(path = '', init: RequestInit = {}) {
    this.assertConfigured();
    const headers = new Headers(init.headers);
    headers.set('x-worthrun-event-media-secret', this.sharedSecret);
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      signal: init.signal || AbortSignal.timeout(this.timeoutMs),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new EventMediaUnavailableError(data?.message || `赛事媒体服务返回 HTTP ${response.status}`);
    return data as Record<string, unknown>;
  }

  async upload(input: { assetId: string; buffer: Buffer; mimeType: string; filename: string }) {
    const form = new FormData();
    form.set('assetId', input.assetId);
    form.set('file', new Blob([input.buffer], { type: input.mimeType }), input.filename);
    return (await this.request('', { method: 'POST', body: form })) as unknown as EventMediaUploadResult;
  }

  async temporaryUrls(fileIds: string[]) {
    const uniqueFileIds = [...new Set(fileIds.filter(Boolean))].slice(0, 100);
    if (!uniqueFileIds.length) return new Map<string, string>();
    const result = new Map<string, string>();
    const missing: string[] = [];
    for (const fileId of uniqueFileIds) {
      const cached = this.tempUrlCache.get(fileId);
      if (cached) result.set(fileId, cached);
      else missing.push(fileId);
    }
    if (missing.length) {
      const fetched = await this.fetchTemporaryUrls(missing);
      for (const [fileId, url] of fetched) {
        this.tempUrlCache.set(fileId, url);
        result.set(fileId, url);
      }
    }
    return result;
  }

  /**
   * 实际调用云函数换签。对同一批未命中 fileId 做请求级去重，
   * 避免并发列表请求同时打穿缓存触发重复云函数调用。
   */
  private async fetchTemporaryUrls(fileIds: string[]): Promise<Map<string, string>> {
    const dedupeKey = fileIds.join('\n');
    return this.dedupeFetch(dedupeKey, async () => {
      const data = await this.request('', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'temporary-url', fileIds }),
      });
      const urls = Array.isArray(data.urls) ? data.urls : [];
      return new Map(
        urls
          .filter((item): item is { fileId: string; url: string } => Boolean(item && typeof item.fileId === 'string' && typeof item.url === 'string'))
          .map((item) => [item.fileId, item.url]),
      );
    });
  }

  /** 对相同 key 的并发请求复用同一个 in-flight Promise。 */
  private async dedupeFetch(
    key: string,
    loader: () => Promise<Map<string, string>>,
  ): Promise<Map<string, string>> {
    const existing = this.inflightTempUrl.get(key);
    if (existing) return existing;
    const promise = loader().finally(() => this.inflightTempUrl.delete(key));
    this.inflightTempUrl.set(key, promise);
    return promise;
  }

  async deleteFiles(fileIds: string[]) {
    const ids = [...new Set(fileIds.filter(Boolean))].slice(0, 100);
    if (!ids.length) return { deleted: 0 };
    for (const id of ids) this.tempUrlCache.invalidate(id);
    return this.request('', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileIds: ids }),
    });
  }

  async deleteOrphans(fileIds: string[]) {
    const ids = [...new Set(fileIds.filter(Boolean))].slice(0, 500);
    if (!ids.length) return { deleted: 0 };
    return this.request('', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete-orphans', fileIds: ids }),
    });
  }
}

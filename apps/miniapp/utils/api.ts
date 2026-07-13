import { config } from '../config/index';

export type RunJudgement = 'priority' | 'watch' | 'unverified';
export type SignupStatus = 'signup_open' | 'closing_soon' | 'closed' | 'not_started' | 'unknown';
export type InfoStatus =
  'ai_generated' | 'pending_verify' | 'verified' | 'user_flagged' | 'source_error';

export interface EventSummary {
  id: string;
  eventName: string;
  city: string;
  eventDate: string;
  distanceItems: string[];
  signupStatus: SignupStatus;
  signupDeadline?: string | null;
  runJudgement: RunJudgement;
  judgementSummary?: string | null;
  judgementReasons: string[];
  tags: string[];
  updatedAt?: string;
  isFavorite?: boolean;
}

export interface ChecklistItem {
  id?: string;
  groupName: string;
  itemName: string;
  itemStatus: InfoStatus;
  description?: string | null;
  sortOrder?: number;
}

export interface EventDetail extends EventSummary {
  startPoint?: string | null;
  endPoint?: string | null;
  officialUrl: string;
  sourceName: string;
  sourceUrl?: string | null;
  sourceLevel: string;
  infoStatus: InfoStatus;
  suitableFor: string[];
  notSuitableFor: string[];
  checklistItems: ChecklistItem[];
  eventTags: Array<{ tagName: string; tagType: string }>;
}

export interface Preference {
  userKey: string;
  cities: string[];
  distances: string[];
  focusTags: string[];
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  data?: object;
  loadingText?: string;
  silent?: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

function getBaseUrl() {
  return config.apiBaseUrl;
}

function toQuery(data?: object) {
  if (!data) return '';
  const record = data as Record<string, unknown>;
  const pairs = Object.keys(record)
    .filter((key) => record[key] !== undefined && record[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(record[key]))}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method || 'GET';
  const isGet = method === 'GET';
  const url = `${getBaseUrl()}${path}${isGet ? toQuery(options.data) : ''}`;

  if (options.loadingText) wx.showLoading({ title: options.loadingText, mask: true });

  return new Promise<T>((resolve, reject) => {
    wx.request({
      url,
      method,
      data: isGet ? undefined : options.data,
      header: { 'content-type': 'application/json' },
      success(res) {
        const data = res.data as { message?: string };
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T);
          return;
        }

        const message = data?.message || '请求失败';
        if (!options.silent) wx.showToast({ title: message, icon: 'none' });
        const retryAfterHeader = res.header?.['Retry-After'] || res.header?.['retry-after'];
        const retryAfterSeconds = Number(retryAfterHeader);
        reject(
          new ApiError(
            message,
            res.statusCode,
            Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
          ),
        );
      },
      fail(error) {
        const message = error.errMsg || '网络异常';
        if (!options.silent) wx.showToast({ title: message, icon: 'none' });
        reject(new ApiError(message));
      },
      complete() {
        if (options.loadingText) wx.hideLoading();
      },
    });
  });
}

export function getEvents(params: Record<string, unknown> = {}) {
  return request<{
    items: EventSummary[];
    total: number;
    complianceNotice: string;
    officialActionText: string;
  }>('/api/events', { data: params, silent: true });
}

export function getEventDetail(id: string) {
  return request<{ event: EventDetail; complianceNotice: string; officialActionText: string }>(
    `/api/events/${id}`,
    { silent: true },
  );
}

export function savePreference(preference: Preference) {
  return request<Preference>('/api/preferences', {
    method: 'POST',
    data: preference,
    loadingText: '保存中',
  });
}

export function getPreference(userKey: string) {
  return request<Preference>(`/api/preferences/${userKey}`, { silent: true });
}

export function getFavorites(userKey: string) {
  return request<{ items: Array<{ eventId: string; event: EventDetail }> }>('/api/favorites', {
    data: { userKey },
    silent: true,
  });
}

export function addFavorite(userKey: string, eventId: string) {
  return request('/api/favorites', {
    method: 'POST',
    data: { userKey, eventId },
    loadingText: '处理中',
  });
}

export function removeFavorite(userKey: string, eventId: string) {
  return request(`/api/favorites/${eventId}?userKey=${encodeURIComponent(userKey)}`, {
    method: 'DELETE',
    loadingText: '处理中',
  });
}

export function submitFeedback(data: {
  eventId: string;
  userKey: string;
  requestId: string;
  feedbackType: string;
  content: string;
}) {
  return request<{ id: string; duplicate: boolean; message?: string }>('/api/feedback', {
    method: 'POST',
    data,
    loadingText: '提交中',
    silent: true,
  });
}

export function getChecklistTemplates(type?: string) {
  const query = type ? `?type=${encodeURIComponent(type)}` : '';
  return request<{ items: ChecklistItem[] }>(`/api/checklist/templates${query}`, {
    silent: true,
  });
}

export function recordShare(data: {
  userKey: string;
  eventId?: string;
  shareType: 'page_share' | 'image_generate';
  scene: 'event_detail' | 'after_favorite' | 'home' | 'events' | 'share_card';
}) {
  return request<{ id: string }>('/api/share-records', { method: 'POST', data, silent: true });
}

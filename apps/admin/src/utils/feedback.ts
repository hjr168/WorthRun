import type { FeedbackItem } from '../types';
import type { Key } from 'react';

export interface FeedbackQueryInput {
  page: number;
  pageSize: number;
  status?: string;
  scope?: string;
  feedbackType?: string;
  contextPage?: string;
  eventScope?: string;
  search?: string;
}

export function buildFeedbackQuery(input: FeedbackQueryInput) {
  const params = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) });
  if (input.status) params.set('status', input.status);
  if (input.scope) params.set('scope', input.scope);
  if (input.feedbackType) params.set('feedbackType', input.feedbackType);
  if (input.contextPage) params.set('contextPage', input.contextPage);
  if (input.eventScope) params.set('eventScope', input.eventScope);
  if (input.search?.trim()) params.set('search', input.search.trim());
  return params.toString();
}

export function feedbackSnapshots(items: FeedbackItem[], ids: Key[]) {
  const selected = new Set(ids.map(String));
  return items
    .filter((item) => selected.has(item.id))
    .map((item) => ({ id: item.id, updatedAt: item.updatedAt }));
}

export function boundedSelection(keys: Key[], max = 50) {
  return keys.length <= max ? { accepted: true as const, keys } : { accepted: false as const, keys: [] };
}

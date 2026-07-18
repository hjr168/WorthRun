import type { EventChoiceStatsQuery } from '../types';

export function buildEventChoiceStatsQuery(query: EventChoiceStatsQuery) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    sort: query.sort,
  });
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.publishStatus) params.set('publishStatus', query.publishStatus);
  if (query.eventDateFrom) params.set('eventDateFrom', query.eventDateFrom);
  if (query.eventDateTo) params.set('eventDateTo', query.eventDateTo);
  return params.toString();
}

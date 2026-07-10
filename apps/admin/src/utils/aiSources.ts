import type { EventSourceRunSummary } from '../types';

export function formatEventSourceRunSummary(summary: EventSourceRunSummary) {
  return [
    `读取 ${summary.fetched} 条`,
    `新增 ${summary.created} 条`,
    `更新 ${summary.updated} 条`,
    `跳过已审核 ${summary.skippedReviewed} 条`,
    `疑似重复 ${summary.duplicateEvents} 条`,
  ].join('，');
}

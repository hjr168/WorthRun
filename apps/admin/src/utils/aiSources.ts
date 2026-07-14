import type { CandidateReviewIssue, EventSourceRunItem, EventSourceRunSummary } from '../types';

export function formatEventSourceRunSummary(summary: EventSourceRunSummary) {
  return [
    `读取 ${summary.fetched} 条`,
    `新增 ${summary.created} 条`,
    `更新 ${summary.updated} 条`,
    `跳过已审核 ${summary.skippedReviewed} 条`,
    `疑似重复 ${summary.duplicateEvents} 条`,
  ].join('，');
}

const issueLabels: Record<CandidateReviewIssue, string> = {
  missing_event_date: '缺少比赛日期',
  missing_official_url: '缺少官方入口',
  missing_source_url: '缺少来源链接',
  duplicate_event: '疑似重复赛事',
};

export function candidateIssueLabel(issue: CandidateReviewIssue) {
  return issueLabels[issue];
}

export function formatScheduleInterval(hours: number) {
  return `每${hours}小时`;
}

export function formatRunPageRange(
  run: Pick<EventSourceRunItem, 'startPage' | 'endPage' | 'pageCount'>,
) {
  if (run.startPage == null || run.endPage == null) return run.pageCount ? '单页' : '-';
  return run.startPage === run.endPage
    ? `第${run.startPage}页`
    : `第${run.startPage}-${run.endPage}页`;
}

export function formatRunDuration(startedAt: string, finishedAt?: string | null) {
  if (!finishedAt) return '运行中';
  const milliseconds = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '-';
  const seconds = milliseconds / 1000;
  return seconds < 60
    ? `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}秒`
    : `${(seconds / 60).toFixed(1)}分钟`;
}

export function runStatusLabel(status: EventSourceRunItem['status']) {
  return { running: '运行中', succeeded: '成功', failed: '失败' }[status];
}

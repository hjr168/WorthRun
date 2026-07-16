import { describe, expect, it } from 'vitest';
import {
  candidateIssueLabel,
  formatEventSourceRunSummary,
  formatRunDuration,
  formatRunPageRange,
  formatScheduleInterval,
  runStatusLabel,
} from './aiSources.js';

describe('formatEventSourceRunSummary', () => {
  it('formats operator-friendly batch counts', () => {
    expect(
      formatEventSourceRunSummary({
        runId: 'run-1',
        sourceId: 'source-1',
        trigger: 'manual',
        totalAvailable: 2830,
        startPage: 1,
        endPage: 1,
        pageCount: 1,
        nextPage: 2,
        fetched: 20,
        created: 16,
        updated: 2,
        skippedReviewed: 2,
        skippedExpired: 3,
        skippedOutsideRegion: 4,
      duplicateEvents: 1,
      changeAlertsCreated: 0,
      changeAlertsExisting: 0,
      candidateIds: [],
      }),
    ).toBe(
      '读取 20 条，新增 16 条，更新 2 条，跳过已审核 2 条，过滤过期 3 条，过滤区域外 4 条，疑似重复 1 条',
    );
  });

  it('formats source schedules and run history fields', () => {
    expect(formatScheduleInterval(24)).toBe('每24小时');
    expect(formatRunPageRange({ startPage: 3, endPage: 4, pageCount: 2 })).toBe('第3-4页');
    expect(formatRunPageRange({ startPage: null, endPage: null, pageCount: 1 })).toBe('单页');
    expect(formatRunDuration('2026-07-14T01:00:00.000Z', '2026-07-14T01:00:08.500Z')).toBe('8.5秒');
    expect(runStatusLabel('failed')).toBe('失败');
  });

  it('maps review issues to fixed operator labels', () => {
    expect(candidateIssueLabel('missing_event_date')).toBe('缺少比赛日期');
    expect(candidateIssueLabel('missing_official_url')).toBe('缺少官方入口');
    expect(candidateIssueLabel('missing_source_url')).toBe('缺少来源链接');
    expect(candidateIssueLabel('duplicate_event')).toBe('疑似重复赛事');
  });
});

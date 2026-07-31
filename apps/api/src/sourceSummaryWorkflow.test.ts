import { describe, expect, it, vi } from 'vitest';

// Mock generateEventSourceSummary so createSourceSummaryDraft can be tested without
// real page fetching or AI calls. Each test resolves generateMock to the desired branch.
const generateMock = vi.fn();
vi.mock('./sourceSummaryGeneration.js', () => ({
  generateEventSourceSummary: (...args: unknown[]) => generateMock(...args),
}));

import {
  assertSourceSummaryReverifyEligible,
  createSourceSummaryDraft,
  SourceSummaryConflictError,
  SourceSummaryValidationError,
} from './sourceSummaryWorkflow.js';

describe('source summary workflow errors', () => {
  it('uses distinct conflict and validation errors for HTTP mapping', () => {
    expect(new SourceSummaryConflictError('conflict')).toBeInstanceOf(Error);
    expect(new SourceSummaryValidationError('invalid')).toBeInstanceOf(Error);
  });

  it('allows a stale published summary after all change alerts are handled', () => {
    expect(() =>
      assertSourceSummaryReverifyEligible(
        {
          status: 'published',
          staleAt: new Date(),
          sourceUrl: 'https://example.com/race',
          openChangeAlerts: 0,
        },
        '已核对原始来源',
      ),
    ).not.toThrow();
  });

  it('blocks restoring a summary while event changes remain open', () => {
    expect(() =>
      assertSourceSummaryReverifyEligible(
        {
          status: 'published',
          staleAt: new Date(),
          sourceUrl: 'https://example.com/race',
          openChangeAlerts: 1,
        },
        '已核对原始来源',
      ),
    ).toThrow('请先处理该赛事的开放变更');
  });

  it('requires a review note', () => {
    expect(() =>
      assertSourceSummaryReverifyEligible(
        {
          status: 'published',
          staleAt: new Date(),
          sourceUrl: 'https://example.com/race',
          openChangeAlerts: 0,
        },
        '短',
      ),
    ).toThrow('复核备注需为 4-500 字');
  });
});

describe('createSourceSummaryDraft cache handling', () => {
  it('refreshes fetchedAt and signals reused when source content is unchanged', async () => {
    // 命中缓存（来源内容未变化）：应更新已有记录的 fetchedAt，并返回 reused: true，
    // 而不是假装生成新草稿、也不重新调用 AI。
    const oldFetchedAt = new Date('2026-07-01T00:00:00.000Z');
    const reusedRecord = {
      id: 'summary-1',
      eventId: 'event-1',
      status: 'published',
      contentHash: 'abc',
      fetchedAt: oldFetchedAt,
    };
    generateMock.mockResolvedValueOnce({ reused: reusedRecord });
    const updated = { ...reusedRecord, fetchedAt: new Date('2026-07-31T02:00:00.000Z') };
    const updateMock = vi.fn().mockResolvedValue(updated);
    const logCreateMock = vi.fn().mockResolvedValue({});
    const store = {
      eventSourceSummary: { update: updateMock },
      adminOperationLog: { create: logCreateMock },
    } as never;

    const result = await createSourceSummaryDraft('event-1', 'admin-1', store);

    expect(result.reused).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'summary-1' },
        data: expect.objectContaining({ fetchedAt: expect.any(Date) }),
      }),
    );
    // 更新后的 fetchedAt 必须比旧值新，证明抓取时间已刷新
    expect((result as { fetchedAt: Date }).fetchedAt.getTime()).toBeGreaterThan(
      oldFetchedAt.getTime(),
    );
    // 写入 refetch_unchanged 日志，区别于新建草稿
    expect(logCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'source_summary.refetch_unchanged' }),
      }),
    );
  });

  it('creates a new draft and signals reused=false when content changed', async () => {
    // 内容变化：正常创建新草稿，返回 reused: false
    generateMock.mockResolvedValueOnce({
      generated: {
        eventId: 'event-1',
        basis: 'page_text',
        sourceName: '官网',
        sourceUrl: 'https://race.example',
        sourceTitle: '公告',
        summary: '摘要内容',
        keyPoints: ['要点一'],
        limitations: null,
        contentHash: 'newhash',
        aiProvider: 'glm',
        aiModel: 'glm-5.2',
        promptVersion: 'source-summary-v1',
        fetchedAt: new Date(),
      },
    });
    const created = { id: 'summary-new', eventId: 'event-1', status: 'draft' };
    const createMock = vi.fn().mockResolvedValue(created);
    const logCreateMock = vi.fn().mockResolvedValue({});
    const store = {
      eventSourceSummary: { create: createMock },
      adminOperationLog: { create: logCreateMock },
    } as never;

    const result = await createSourceSummaryDraft('event-1', 'admin-1', store);

    expect(result.reused).toBe(false);
    expect(createMock).toHaveBeenCalledOnce();
    expect(logCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'source_summary.generate_draft' }),
      }),
    );
  });
});

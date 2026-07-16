import { describe, expect, it } from 'vitest';
import { eventPublishIssues } from './eventPublishWorkflow.js';

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    eventName: '2026广州马拉松',
    city: '广州',
    eventDate: new Date('2026-12-20T00:00:00.000Z'),
    distanceItems: ['马拉松'],
    signupStatus: 'unknown',
    officialUrl: 'https://official.example/plan.pdf',
    sourceName: '中国田协年度计划',
    sourceUrl: 'https://official.example/plan.pdf',
    sourceLevel: 'official',
    publishStatus: 'draft',
    infoStatus: 'ai_generated',
    runJudgement: 'unverified',
    judgementSummary: '报名待核实',
    judgementReasons: ['已列入官方年度计划'],
    updatedAt: new Date('2026-07-16T00:00:00.000Z'),
    checklistItems: [{}],
    ...overrides,
  };
}

describe('event publish workflow', () => {
  it('accepts a complete future Greater Bay Area draft', () => {
    expect(eventPublishIssues(event(), new Date('2026-07-16T00:00:00.000Z'))).toEqual([]);
  });

  it('requires judgement reasons and checklist items', () => {
    expect(
      eventPublishIssues(
        event({ judgementReasons: [], checklistItems: [] }),
        new Date('2026-07-16T00:00:00.000Z'),
      ),
    ).toEqual(expect.arrayContaining(['missing_judgement_reasons', 'missing_checklist']));
  });

  it('rejects risky and out-of-region records', () => {
    const issues = eventPublishIssues(
      event({ city: '北京', judgementSummary: '网传消息' }),
      new Date('2026-07-16T00:00:00.000Z'),
    );
    expect(issues).toEqual(
      expect.arrayContaining(['当前仅允许发布粤港澳大湾区赛事', 'risk_keyword:网传']),
    );
  });
});

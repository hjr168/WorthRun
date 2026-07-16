import { describe, expect, it } from 'vitest';
import { buildConfirmationLinkBackfillPlan } from './candidateConfirmationBackfill.js';
import { parseCandidateConfirmationBackfillArgs } from './candidateConfirmationBackfillCli.js';

const extractedData = {
  eventName: '2026广州马拉松',
  city: '广州',
  eventDate: '2026-12-20',
  distanceItems: ['马拉松'],
  signupStatus: 'unknown',
  signupDeadline: null,
  officialUrl: null,
  sourceName: '中国田协年度计划',
  sourceUrl: 'https://official.example/plan.pdf',
  sourceLevel: 'official',
  runJudgement: 'unverified',
  judgementSummary: '报名待核实',
  judgementReasons: ['已列入年度计划'],
  suitableFor: [],
  notSuitableFor: [],
  tags: [],
  evidence: [
    { field: 'eventDate', sourceUrl: 'https://official.example/plan.pdf', quote: '12月20日' },
  ],
  confidence: {},
};

describe('candidate confirmation link backfill', () => {
  it('only promotes official source URLs for pending candidates', () => {
    const plan = buildConfirmationLinkBackfillPlan([
      {
        id: 'official',
        status: 'new',
        sourceUrl: extractedData.sourceUrl,
        officialUrl: null,
        extractedData: { ...extractedData, sourceLevel: 'unknown' },
        duplicateEventId: null,
        source: { sourceLevel: 'official' },
      },
      {
        id: 'community',
        status: 'new',
        sourceUrl: 'https://community.example/event',
        officialUrl: null,
        extractedData: { ...extractedData, sourceLevel: 'community' },
        duplicateEventId: null,
        source: { sourceLevel: 'community' },
      },
    ]);
    expect(plan).toHaveLength(1);
    expect(plan[0].extractedData.officialUrl).toBe(extractedData.sourceUrl);
    expect(plan[0].extractedData.sourceLevel).toBe('official');
  });

  it('requires an expected count for apply', () => {
    expect(parseCandidateConfirmationBackfillArgs([])).toEqual({
      dryRun: true,
      expected: undefined,
    });
    expect(() => parseCandidateConfirmationBackfillArgs(['--apply'])).toThrow('--expected');
  });
});

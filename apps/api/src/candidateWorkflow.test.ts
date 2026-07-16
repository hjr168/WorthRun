import { describe, expect, it } from 'vitest';
import {
  buildCandidateDuplicateGroups,
  candidateAcceptIssues,
  mergeCandidateData,
  type CandidateWorkflowItem,
} from './candidateWorkflow.js';

function candidate(overrides: Partial<CandidateWorkflowItem> = {}): CandidateWorkflowItem {
  const id = overrides.id || 'candidate-1';
  const sourceLevel = overrides.source?.sourceLevel || 'official';
  const data = {
    eventName: '港珠澳大桥半马',
    city: '香港',
    eventDate: '2026-11-15',
    distanceItems: ['半程马拉松'],
    signupStatus: 'unknown',
    signupDeadline: null,
    officialUrl: 'https://official.example/event',
    sourceName: '赛事官网',
    sourceUrl: 'https://official.example/event',
    sourceLevel,
    runJudgement: 'unverified',
    judgementSummary: '待核实',
    judgementReasons: ['官方已公布比赛日期'],
    suitableFor: [],
    notSuitableFor: [],
    tags: ['半马'],
    evidence: [
      { field: 'eventDate', sourceUrl: 'https://official.example/event', quote: '2026-11-15' },
    ],
    confidence: {},
    ...(overrides.extractedData as object),
  };
  const source = overrides.source || {
    id: `source-${id}`,
    name: data.sourceName,
    sourceType: 'page_url',
    sourceLevel,
  };
  return {
    id,
    status: 'new',
    eventName: data.eventName,
    city: data.city,
    eventDate: new Date('2026-11-15T00:00:00.000Z'),
    officialUrl: data.officialUrl,
    sourceUrl: data.sourceUrl,
    reviewIssues: [],
    updatedAt: new Date('2026-07-16T00:00:00.000Z'),
    ...overrides,
    extractedData: data,
    evidence: data.evidence,
    source,
  };
}

describe('candidate duplicate workflow', () => {
  it('groups same-city same-date candidates with overlapping distances', () => {
    const group = buildCandidateDuplicateGroups([
      candidate(),
      candidate({
        id: 'candidate-2',
        extractedData: { eventName: 'HZMB Half Marathon', distanceItems: ['Half Marathon'] },
      }),
      candidate({ id: 'candidate-3', city: '澳门', extractedData: { city: '澳门' } }),
    ]);
    expect(group).toHaveLength(1);
    expect(group[0].items.map((item) => item.id)).toEqual(['candidate-1', 'candidate-2']);
  });

  it('merges evidence and arrays while preferring the strongest official source', () => {
    const community = candidate({
      id: 'community',
      officialUrl: null,
      source: {
        id: 'source-community',
        name: '社区发现',
        sourceType: 'chinamarathon_sitemap',
        sourceLevel: 'community',
      },
      extractedData: {
        officialUrl: null,
        sourceName: '社区发现',
        sourceUrl: 'https://community.example/event',
        sourceLevel: 'community',
        tags: ['社区发现'],
        evidence: [
          {
            field: 'eventDate',
            sourceUrl: 'https://community.example/event',
            quote: '比赛日期 2026-11-15',
          },
        ],
      },
    });
    const official = candidate({ id: 'official' });
    const merged = mergeCandidateData([community, official], 'community');
    expect(merged.eventName).toBe('港珠澳大桥半马');
    expect(merged.officialUrl).toBe('https://official.example/event');
    expect(merged.sourceLevel).toBe('official');
    expect(merged.tags).toEqual(expect.arrayContaining(['社区发现', '半马']));
    expect(merged.evidence).toHaveLength(2);
  });

  it('keeps missing-date candidates out of bulk acceptance', () => {
    const item = candidate({
      eventDate: null,
      extractedData: { eventDate: null },
      reviewIssues: ['missing_event_date'],
    });
    expect(candidateAcceptIssues(item)).toContain('missing_event_date');
  });

  it('keeps reviewed candidates out of bulk acceptance', () => {
    const item = candidate({ status: 'accepted' });
    expect(candidateAcceptIssues(item, new Date('2026-07-16T00:00:00.000Z'))).toContain(
      'candidate_not_pending',
    );
  });

  it('blocks candidates already linked to an existing event', () => {
    const item = candidate({ reviewIssues: ['duplicate_event'] });
    expect(candidateAcceptIssues(item, new Date('2026-07-16T00:00:00.000Z'))).toContain(
      'duplicate_event',
    );
  });
});

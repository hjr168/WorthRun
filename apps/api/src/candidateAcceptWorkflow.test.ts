import { describe, expect, it } from 'vitest';
import { selectChecklistTemplate } from './candidateAcceptWorkflow.js';

const item = (name: string) => [
  { groupName: '清单', itemName: name, itemStatus: 'pending_verify' as const, sortOrder: 1 },
];

describe('candidate acceptance checklist templates', () => {
  const templates = {
    general: item('通用'),
    '10K': item('十公里'),
    half: item('半马'),
    full: item('全马'),
  };

  it('uses the longest matching race distance template', () => {
    expect(selectChecklistTemplate(['半程马拉松', '马拉松'], templates)[0].itemName).toBe('全马');
    expect(selectChecklistTemplate(['10公里'], templates)[0].itemName).toBe('十公里');
  });

  it('falls back to the general template', () => {
    expect(selectChecklistTemplate(['欢乐跑'], templates)[0].itemName).toBe('通用');
  });
});

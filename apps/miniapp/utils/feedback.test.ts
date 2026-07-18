import { describe, expect, it } from 'vitest';
import { mergeFeedbackReceipt, type FeedbackReceipt } from './feedback';

function receipt(requestId: string): FeedbackReceipt {
  return {
    eventId: requestId,
    eventName: `赛事 ${requestId}`,
    feedbackType: '日期有误',
    createdAt: '2026-07-16T00:00:00.000Z',
    requestId,
  };
}

const productReceipt: FeedbackReceipt = {
  scope: 'product_feedback',
  feedbackType: '功能建议',
  contextPage: 'mine',
  createdAt: '2026-07-18T10:00:00.000Z',
  requestId: 'product',
};

describe('feedback receipts', () => {
  it('deduplicates by request id and keeps the newest five', () => {
    const initial = ['a', 'b', 'c', 'd', 'e'].map(receipt);
    expect(mergeFeedbackReceipt(initial, receipt('c')).map((item) => item.requestId)).toEqual([
      'c',
      'a',
      'b',
      'd',
      'e',
    ]);
    expect(mergeFeedbackReceipt(initial, receipt('f')).map((item) => item.requestId)).toEqual([
      'f',
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('keeps product and event receipts in the same bounded list', () => {
    expect(mergeFeedbackReceipt([receipt('event')], productReceipt)).toHaveLength(2);
  });
});

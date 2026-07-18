export const feedbackReceiptStorageKey = 'worthrun_feedback_receipts';

export interface FeedbackReceipt {
  scope?: 'event_correction' | 'product_feedback';
  eventId?: string;
  eventName?: string;
  feedbackType: string;
  createdAt: string;
  requestId: string;
  contextPage?: string;
}

export function mergeFeedbackReceipt(
  receipts: FeedbackReceipt[],
  receipt: FeedbackReceipt,
  limit = 5,
) {
  return [receipt, ...receipts.filter((item) => item.requestId !== receipt.requestId)].slice(0, limit);
}

export function getFeedbackReceipts(): FeedbackReceipt[] {
  try {
    const value = wx.getStorageSync(feedbackReceiptStorageKey);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function createFeedbackRequestId() {
  const random = Math.random().toString(36).slice(2, 12);
  return `feedback_${Date.now().toString(36)}_${random}`;
}

export function saveFeedbackReceipt(receipt: FeedbackReceipt) {
  const receipts = mergeFeedbackReceipt(getFeedbackReceipts(), receipt);
  try {
    wx.setStorageSync(feedbackReceiptStorageKey, receipts);
  } catch {}
  return receipts;
}

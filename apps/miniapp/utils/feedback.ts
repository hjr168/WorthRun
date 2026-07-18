export const feedbackReceiptStorageKey = 'worthrun_feedback_receipts';

export interface FeedbackReceipt {
  eventId: string;
  eventName: string;
  feedbackType: string;
  createdAt: string;
  requestId: string;
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

export function saveFeedbackReceipt(receipt: FeedbackReceipt) {
  const receipts = mergeFeedbackReceipt(getFeedbackReceipts(), receipt);
  try {
    wx.setStorageSync(feedbackReceiptStorageKey, receipts);
  } catch {}
  return receipts;
}

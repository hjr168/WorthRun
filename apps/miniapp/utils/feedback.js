"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedbackReceiptStorageKey = void 0;
exports.mergeFeedbackReceipt = mergeFeedbackReceipt;
exports.getFeedbackReceipts = getFeedbackReceipts;
exports.createFeedbackRequestId = createFeedbackRequestId;
exports.saveFeedbackReceipt = saveFeedbackReceipt;
exports.feedbackReceiptStorageKey = 'worthrun_feedback_receipts';
function mergeFeedbackReceipt(receipts, receipt, limit = 5) {
    return [receipt, ...receipts.filter((item) => item.requestId !== receipt.requestId)].slice(0, limit);
}
function getFeedbackReceipts() {
    try {
        const value = wx.getStorageSync(exports.feedbackReceiptStorageKey);
        return Array.isArray(value) ? value : [];
    }
    catch (_a) {
        return [];
    }
}
function createFeedbackRequestId() {
    const random = Math.random().toString(36).slice(2, 12);
    return `feedback_${Date.now().toString(36)}_${random}`;
}
function saveFeedbackReceipt(receipt) {
    const receipts = mergeFeedbackReceipt(getFeedbackReceipts(), receipt);
    try {
        wx.setStorageSync(exports.feedbackReceiptStorageKey, receipts);
    }
    catch (_a) { }
    return receipts;
}

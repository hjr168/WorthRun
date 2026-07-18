"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedbackReceiptStorageKey = void 0;
exports.mergeFeedbackReceipt = mergeFeedbackReceipt;
exports.getFeedbackReceipts = getFeedbackReceipts;
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
function saveFeedbackReceipt(receipt) {
    const receipts = mergeFeedbackReceipt(getFeedbackReceipts(), receipt);
    try {
        wx.setStorageSync(exports.feedbackReceiptStorageKey, receipts);
    }
    catch (_a) { }
    return receipts;
}

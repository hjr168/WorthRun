"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMiniappVersion = getMiniappVersion;
exports.productFeedbackUrl = productFeedbackUrl;
exports.openProductFeedback = openProductFeedback;
function getMiniappVersion() {
    try {
        return wx.getAccountInfoSync().miniProgram.version || undefined;
    }
    catch (_a) {
        return undefined;
    }
}
function productFeedbackUrl(contextPage, relatedRequestId) {
    const query = [`contextPage=${encodeURIComponent(contextPage)}`];
    if (relatedRequestId)
        query.push(`relatedRequestId=${encodeURIComponent(relatedRequestId)}`);
    return `/pages/product-feedback/index?${query.join('&')}`;
}
function openProductFeedback(contextPage, relatedRequestId) {
    wx.navigateTo({ url: productFeedbackUrl(contextPage, relatedRequestId) });
}

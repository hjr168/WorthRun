"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveMiniappVersion = resolveMiniappVersion;
exports.getMiniappVersion = getMiniappVersion;
exports.productFeedbackUrl = productFeedbackUrl;
exports.openProductFeedback = openProductFeedback;
function resolveMiniappVersion(miniProgram) {
    var _a, _b;
    const version = (_a = miniProgram === null || miniProgram === void 0 ? void 0 : miniProgram.version) === null || _a === void 0 ? void 0 : _a.trim();
    if (version)
        return version;
    const envVersion = (_b = miniProgram === null || miniProgram === void 0 ? void 0 : miniProgram.envVersion) === null || _b === void 0 ? void 0 : _b.trim();
    return envVersion && ['develop', 'trial', 'release'].includes(envVersion)
        ? envVersion
        : undefined;
}
function getMiniappVersion() {
    try {
        return resolveMiniappVersion(wx.getAccountInfoSync().miniProgram);
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

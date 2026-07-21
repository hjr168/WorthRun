"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productFeedbackContexts = void 0;
exports.resolveProductFeedbackContext = resolveProductFeedbackContext;
exports.canSubmitProductFeedback = canSubmitProductFeedback;
exports.resolveMiniappVersion = resolveMiniappVersion;
exports.getMiniappVersion = getMiniappVersion;
exports.productFeedbackUrl = productFeedbackUrl;
exports.openProductFeedback = openProductFeedback;
exports.productFeedbackContexts = [
    'home',
    'events',
    'event_detail',
    'source_summary',
    'favorites',
    'choices',
    'mine',
];
function resolveProductFeedbackContext(value) {
    const normalized = (value === null || value === void 0 ? void 0 : value.trim()) || '';
    if (exports.productFeedbackContexts.includes(normalized)) {
        return {
            contextPage: normalized,
            customContextPage: '',
            isCustomContext: false,
        };
    }
    if (normalized) {
        return {
            contextPage: 'mine',
            customContextPage: normalized,
            isCustomContext: true,
        };
    }
    return {
        contextPage: 'mine',
        customContextPage: '',
        isCustomContext: false,
    };
}
function canSubmitProductFeedback(contentLength, isCustomContext, customContextPage) {
    const hasValidContent = contentLength >= 6 && contentLength <= 500;
    return hasValidContent && (!isCustomContext || Boolean(customContextPage.trim()));
}
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

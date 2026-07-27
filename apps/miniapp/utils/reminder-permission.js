"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSubscribeMessageError = getSubscribeMessageError;
function getSubscribeMessageError(error) {
    const detail = typeof error === 'object' && error
        ? String(error.errMsg ||
            error.message ||
            '').toLowerCase()
        : '';
    if (detail.includes('tap gesture'))
        return '请再次点击开启提醒';
    if (detail.includes('main switch') || detail.includes('switch is off')) {
        return '请在微信设置中开启订阅消息';
    }
    if (detail.includes('cancel') || detail.includes('reject'))
        return '需先允许本次消息提醒';
    if (detail.includes('no permission') || detail.includes('not authorized')) {
        return '当前微信账号暂无法订阅提醒';
    }
    if (detail.includes('template'))
        return '提醒模板配置异常，请稍后再试';
    return '微信订阅授权未完成，请稍后重试';
}

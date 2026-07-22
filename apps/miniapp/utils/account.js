"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureWechatSession = ensureWechatSession;
const api_1 = require("./api");
const user_1 = require("./user");
const user_session_1 = require("./user-session");
let loginPromise = null;
function wxLogin() {
    return new Promise((resolve, reject) => {
        wx.login({
            success: (result) => {
                if (result.code)
                    resolve(result.code);
                else
                    reject(new Error('微信登录失败'));
            },
            fail: reject,
        });
    });
}
function ensureWechatSession(force = false) {
    if (!force && (0, user_session_1.isAutoRegisterPaused)())
        return Promise.resolve(null);
    if (!force && (0, user_session_1.hasValidUserToken)() && (0, user_session_1.getCachedUserProfile)()) {
        return Promise.resolve((0, user_session_1.getCachedUserProfile)());
    }
    if (loginPromise)
        return loginPromise;
    const pending = wxLogin()
        .then((code) => (0, api_1.request)('/api/auth/wechat', {
        method: 'POST',
        data: { code, userKey: (0, user_1.getUserKey)() },
        silent: true,
    }))
        .then((result) => {
        (0, user_session_1.saveUserSession)(result.token, result.user, result.expiresAt);
        return result.user;
    })
        .catch(() => {
        (0, user_session_1.clearUserSession)();
        return null;
    })
        .then((result) => {
        loginPromise = null;
        return result;
    });
    loginPromise = pending;
    return pending;
}

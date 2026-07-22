"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTO_REGISTER_PAUSED_KEY = void 0;
exports.getUserToken = getUserToken;
exports.saveUserSession = saveUserSession;
exports.getCachedUserProfile = getCachedUserProfile;
exports.updateCachedUserProfile = updateCachedUserProfile;
exports.clearUserSession = clearUserSession;
exports.hasValidUserToken = hasValidUserToken;
exports.isAutoRegisterPaused = isAutoRegisterPaused;
exports.resumeAutoRegister = resumeAutoRegister;
const USER_TOKEN_KEY = 'worthrun_user_token';
const USER_PROFILE_KEY = 'worthrun_user_profile';
const USER_TOKEN_EXPIRES_KEY = 'worthrun_user_token_expires';
exports.AUTO_REGISTER_PAUSED_KEY = 'worthrun_auto_register_paused';
function getUserToken() {
    return String(wx.getStorageSync(USER_TOKEN_KEY) || '');
}
function saveUserSession(token, profile, expiresAt) {
    wx.setStorageSync(USER_TOKEN_KEY, token);
    wx.setStorageSync(USER_PROFILE_KEY, profile);
    wx.setStorageSync(USER_TOKEN_EXPIRES_KEY, expiresAt);
}
function getCachedUserProfile() {
    return (wx.getStorageSync(USER_PROFILE_KEY) || null);
}
function updateCachedUserProfile(profile) {
    if (profile)
        wx.setStorageSync(USER_PROFILE_KEY, profile);
    else
        wx.removeStorageSync(USER_PROFILE_KEY);
}
function clearUserSession() {
    wx.removeStorageSync(USER_TOKEN_KEY);
    wx.removeStorageSync(USER_PROFILE_KEY);
    wx.removeStorageSync(USER_TOKEN_EXPIRES_KEY);
}
function hasValidUserToken() {
    const expiresAt = new Date(String(wx.getStorageSync(USER_TOKEN_EXPIRES_KEY) || '')).getTime();
    return Boolean(getUserToken()) && Number.isFinite(expiresAt) && expiresAt > Date.now() + 60000;
}
function isAutoRegisterPaused() {
    return Boolean(wx.getStorageSync(exports.AUTO_REGISTER_PAUSED_KEY));
}
function resumeAutoRegister() {
    wx.removeStorageSync(exports.AUTO_REGISTER_PAUSED_KEY);
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserKey = getUserKey;
exports.clearUserKey = clearUserKey;
const USER_KEY_STORAGE = 'worthrun_user_key';
function createUuid() {
    const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
    return template.replace(/[xy]/g, (char) => {
        const random = Math.floor(Math.random() * 16);
        const value = char === 'x' ? random : (random & 0x3) | 0x8;
        return value.toString(16);
    });
}
function getUserKey() {
    const stored = wx.getStorageSync(USER_KEY_STORAGE);
    if (stored)
        return String(stored);
    const userKey = `anon-${createUuid()}`;
    wx.setStorageSync(USER_KEY_STORAGE, userKey);
    return userKey;
}
function clearUserKey() {
    wx.removeStorageSync(USER_KEY_STORAGE);
}

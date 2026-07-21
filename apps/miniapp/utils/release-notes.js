"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lastReadReleaseStorageKey = void 0;
exports.hasUnreadRelease = hasUnreadRelease;
exports.refreshReleaseBadge = refreshReleaseBadge;
exports.markReleaseRead = markReleaseRead;
const api_1 = require("./api");
exports.lastReadReleaseStorageKey = 'worth-running_last_read_release_id';
function hasUnreadRelease(latestId, lastReadId) {
    return Boolean(latestId && latestId !== lastReadId);
}
function updateTabBadge(hasNew) {
    if (hasNew) {
        wx.setTabBarBadge({ index: 2, text: '新', fail: () => { } });
    }
    else {
        wx.removeTabBarBadge({ index: 2, fail: () => { } });
    }
}
async function refreshReleaseBadge() {
    var _a;
    try {
        const result = await (0, api_1.getLatestReleaseNote)();
        const lastRead = String(wx.getStorageSync(exports.lastReadReleaseStorageKey) || '');
        const hasNew = hasUnreadRelease((_a = result.item) === null || _a === void 0 ? void 0 : _a.id, lastRead);
        updateTabBadge(hasNew);
        return { hasNew, latest: result.item };
    }
    catch (_b) {
        return { hasNew: false, latest: null };
    }
}
function markReleaseRead(id) {
    if (id)
        wx.setStorageSync(exports.lastReadReleaseStorageKey, id);
    updateTabBadge(false);
}

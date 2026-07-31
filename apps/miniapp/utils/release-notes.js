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
// tabBar 顺序（见 app.json）：0 首页 / 1 赛事 / 2 雷达 / 3 我的。
// 版本更新入口在“我的”页，所以未读红点应标记在“我的”（index 3），不是雷达。
const MINE_TAB_INDEX = 3;
function updateTabBadge(hasNew) {
    if (hasNew) {
        wx.setTabBarBadge({ index: MINE_TAB_INDEX, text: '新', fail: () => { } });
    }
    else {
        wx.removeTabBarBadge({ index: MINE_TAB_INDEX, fail: () => { } });
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

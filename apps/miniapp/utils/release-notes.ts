import { getLatestReleaseNote } from './api';

export const lastReadReleaseStorageKey = 'worth-running_last_read_release_id';

export function hasUnreadRelease(latestId?: string | null, lastReadId?: string | null) {
  return Boolean(latestId && latestId !== lastReadId);
}

// tabBar 顺序（见 app.json）：0 首页 / 1 赛事 / 2 雷达 / 3 我的。
// 版本更新入口在“我的”页，所以未读红点应标记在“我的”（index 3），不是雷达。
const MINE_TAB_INDEX = 3;

function updateTabBadge(hasNew: boolean) {
  if (hasNew) {
    wx.setTabBarBadge({ index: MINE_TAB_INDEX, text: '新', fail: () => {} });
  } else {
    wx.removeTabBarBadge({ index: MINE_TAB_INDEX, fail: () => {} });
  }
}

export async function refreshReleaseBadge() {
  try {
    const result = await getLatestReleaseNote();
    const lastRead = String(wx.getStorageSync(lastReadReleaseStorageKey) || '');
    const hasNew = hasUnreadRelease(result.item?.id, lastRead);
    updateTabBadge(hasNew);
    return { hasNew, latest: result.item };
  } catch {
    return { hasNew: false, latest: null };
  }
}

export function markReleaseRead(id?: string) {
  if (id) wx.setStorageSync(lastReadReleaseStorageKey, id);
  updateTabBadge(false);
}

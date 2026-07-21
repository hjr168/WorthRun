import { getLatestReleaseNote } from './api';

export const lastReadReleaseStorageKey = 'worth-running_last_read_release_id';

export function hasUnreadRelease(latestId?: string | null, lastReadId?: string | null) {
  return Boolean(latestId && latestId !== lastReadId);
}

function updateTabBadge(hasNew: boolean) {
  if (hasNew) {
    wx.setTabBarBadge({ index: 2, text: '新', fail: () => {} });
  } else {
    wx.removeTabBarBadge({ index: 2, fail: () => {} });
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

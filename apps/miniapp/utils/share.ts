import { getShareSettings, recordShare, ShareScene, ShareSettings } from './api';
import { getUserKey } from './user';

const SETTINGS_KEY = 'worth-running_share_settings';
const MAX_TITLE_LENGTH = 40;

export const defaultShareSettings: ShareSettings = {
  revision: 'builtin-v1',
  scenes: {
    home: {
      titleTemplate: '哪场值得跑｜帮你判断一场比赛值不值得去',
      imageUrl: '/assets/share/share-brand.jpg',
    },
    events: {
      titleTemplate: '近期大湾区跑步赛事，一起看看哪场值得跑',
      imageUrl: '/assets/share/share-brand.jpg',
    },
    event_detail: {
      titleTemplate: '这场值得跑吗？{eventName}',
      imageUrl: '/assets/share/share-event.jpg',
    },
    tools: {
      titleTemplate: '配速、赛前清单，一次准备好｜哪场值得跑',
      imageUrl: '/assets/share/share-tools.jpg',
    },
    source_summary: {
      titleTemplate: '这场赛事信息，我帮你整理了｜{eventName}',
      imageUrl: '/assets/share/share-event.jpg',
    },
    release_notes: {
      titleTemplate: '哪场值得跑更新了｜{latestVersion}',
      imageUrl: '/assets/share/share-release.jpg',
    },
  },
};

let memorySettings: ShareSettings | null = null;

function safeSettings(value: unknown): ShareSettings {
  const candidate = value as ShareSettings | null;
  if (!candidate?.scenes) return defaultShareSettings;
  const scenes = { ...defaultShareSettings.scenes };
  (Object.keys(scenes) as ShareScene[]).forEach((scene) => {
    const current = candidate.scenes[scene];
    if (current?.titleTemplate && current?.imageUrl) scenes[scene] = current;
  });
  return { revision: candidate.revision || defaultShareSettings.revision, scenes };
}

export function getCachedShareSettings() {
  if (memorySettings) return memorySettings;
  try {
    memorySettings = safeSettings(wx.getStorageSync(SETTINGS_KEY));
  } catch {
    memorySettings = defaultShareSettings;
  }
  return memorySettings;
}

export async function loadShareSettings() {
  try {
    const result = await getShareSettings();
    memorySettings = safeSettings(result.settings);
    wx.setStorageSync(SETTINGS_KEY, memorySettings);
  } catch {
    memorySettings = getCachedShareSettings();
  }
  return memorySettings;
}

export function resolveShareTitle(
  template: string,
  variables: Record<string, string | undefined> = {},
) {
  const resolved = template
    .replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_match, key: string) => variables[key] || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (resolved.length <= MAX_TITLE_LENGTH) return resolved;
  return `${resolved.slice(0, MAX_TITLE_LENGTH - 1).trim()}…`;
}

export function getSharePayload(
  scene: ShareScene,
  path: string,
  variables: Record<string, string | undefined> = {},
  override?: { title?: string; imageUrl?: string },
) {
  const setting = getCachedShareSettings().scenes[scene] || defaultShareSettings.scenes[scene];
  return {
    title: override?.title || resolveShareTitle(setting.titleTemplate, variables),
    path,
    imageUrl: override?.imageUrl || setting.imageUrl,
  };
}

export function enablePublicShare() {
  wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage', 'shareTimeline'] });
}

export function enableProductShareOnly() {
  wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage'] });
}

export function trackShare(
  shareType: 'page_share' | 'timeline_share',
  scene:
    | 'home'
    | 'events'
    | 'event_detail'
    | 'tools'
    | 'source_summary'
    | 'release_notes'
    | 'personal_home',
  eventId?: string,
  requestShareToken = false,
) {
  return recordShare({
    userKey: getUserKey(),
    eventId,
    shareType,
    scene,
    requestShareToken,
  }).catch(() => ({ id: '', shareToken: null }));
}

export function getProductHomeShare() {
  trackShare('page_share', 'personal_home');
  return getSharePayload('home', '/pages/home/index');
}

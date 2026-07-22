export interface EventLaunchQuery {
  id?: string;
  scene?: string;
  shareToken?: string;
}

export type MiniProgramEnvVersion = 'develop' | 'trial' | 'release';

function decodeQueryValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 普通页面分享通过 `id` 传递赛事；getwxacodeunlimit 生成的小程序码
 * 则会把后端写入的 `id=...` 放在 `scene` 中。
 */
export function resolveEventId(query: EventLaunchQuery) {
  const directId = decodeQueryValue(query.id || '').trim();
  if (directId) return directId;

  const scene = decodeQueryValue(query.scene || '').trim();
  if (!scene) return '';

  for (const pair of scene.split('&')) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex < 0) continue;
    const key = decodeQueryValue(pair.slice(0, separatorIndex)).trim();
    if (key !== 'id') continue;
    return decodeQueryValue(pair.slice(separatorIndex + 1)).trim();
  }

  return '';
}

export function resolveMiniProgramEnvVersion(value?: string): MiniProgramEnvVersion {
  if (value === 'develop' || value === 'trial' || value === 'release') return value;
  return 'release';
}

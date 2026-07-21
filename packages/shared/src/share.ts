export const shareSceneValues = [
  'home',
  'events',
  'event_detail',
  'tools',
  'source_summary',
  'release_notes',
] as const;

export type ShareScene = (typeof shareSceneValues)[number];

export interface ShareSceneSetting {
  titleTemplate: string;
  imageUrl: string;
}

export interface ShareSettings {
  revision: string;
  scenes: Record<ShareScene, ShareSceneSetting>;
}

export interface ShareTemplateVariables {
  eventName?: string;
  city?: string;
  eventDate?: string;
  distance?: string;
  judgement?: string;
  latestVersion?: string;
}

export interface EventShareOverrideInput {
  titleTemplate?: string | null;
  imageUrl?: string | null;
}

export const shareTemplateVariableValues = [
  'eventName',
  'city',
  'eventDate',
  'distance',
  'judgement',
  'latestVersion',
] as const;

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

const variablePattern = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;

export function findUnknownShareVariables(template: string) {
  const allowed = new Set<string>(shareTemplateVariableValues);
  return Array.from(template.matchAll(variablePattern), (match) => match[1]).filter(
    (value, index, values) => !allowed.has(value) && values.indexOf(value) === index,
  );
}

export function isAllowedShareImageUrl(value: string, allowedHosts: string[]) {
  if (value.startsWith('/assets/share/')) return true;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' &&
      allowedHosts.map((host) => host.toLowerCase()).includes(parsed.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export function truncateShareTitle(value: string, maxLength = 40) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function resolveShareTitle(
  template: string,
  variables: ShareTemplateVariables = {},
  fallback = defaultShareSettings.scenes.home.titleTemplate,
) {
  const resolved = template.replace(variablePattern, (_match, key: string) => {
    const value = variables[key as keyof ShareTemplateVariables];
    return value == null ? '' : String(value);
  });
  return truncateShareTitle(resolved || fallback);
}

export function mergeShareSettings(value: unknown, revision = 'builtin-v1'): ShareSettings {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const rawScenes =
    raw.scenes && typeof raw.scenes === 'object' ? (raw.scenes as Record<string, unknown>) : raw;
  const scenes = Object.fromEntries(
    shareSceneValues.map((scene) => {
      const fallback = defaultShareSettings.scenes[scene];
      const candidate =
        rawScenes[scene] && typeof rawScenes[scene] === 'object'
          ? (rawScenes[scene] as Record<string, unknown>)
          : {};
      return [
        scene,
        {
          titleTemplate:
            typeof candidate.titleTemplate === 'string' && candidate.titleTemplate.trim()
              ? candidate.titleTemplate.trim()
              : fallback.titleTemplate,
          imageUrl:
            typeof candidate.imageUrl === 'string' && candidate.imageUrl.trim()
              ? candidate.imageUrl.trim()
              : fallback.imageUrl,
        },
      ];
    }),
  ) as Record<ShareScene, ShareSceneSetting>;
  return { revision: String(raw.revision || revision), scenes };
}

export function resolveShareSetting(
  settings: ShareSettings,
  scene: ShareScene,
  variables: ShareTemplateVariables = {},
  override: EventShareOverrideInput = {},
) {
  const base = settings.scenes[scene] || defaultShareSettings.scenes[scene];
  const titleTemplate = override.titleTemplate?.trim() || base.titleTemplate;
  const imageUrl = override.imageUrl?.trim() || base.imageUrl;
  return {
    title: resolveShareTitle(titleTemplate, variables, base.titleTemplate),
    imageUrl,
  };
}

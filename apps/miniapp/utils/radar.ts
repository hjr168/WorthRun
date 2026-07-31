/**
 * V0.6 雷达页面纯逻辑工具（无 wx 依赖，便于单测）。
 *
 * - 构建雷达查询参数（逗号分隔，复用偏好全量城市/距离/关注点）；
 * - 将雷达四组映射为带标题的展示分组（含无偏好时的"近期值得关注"提示）；
 * - 计算是否处于"无偏好"状态，决定是否显示设置引导（不伪装个性化推荐）。
 */
import type { RadarResponse, RadarEventSummary, RadarPrimaryGroup } from './api';

/** 雷达查询参数（GET，逗号分隔）。空数组省略该维度。 */
export function buildRadarQuery(input: {
  cities: string[];
  distances: string[];
  focusTags: string[];
  windowDays?: number;
  campaign?: string;
  limitPerGroup?: number;
}): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (input.cities.length) params.cities = input.cities.join(',');
  if (input.distances.length) params.distances = input.distances.join(',');
  if (input.focusTags.length) params.focusTags = input.focusTags.join(',');
  if (input.windowDays) params.windowDays = input.windowDays;
  if (input.campaign) params.campaign = input.campaign;
  if (input.limitPerGroup) params.limitPerGroup = input.limitPerGroup;
  return params;
}

/** 是否无任何偏好（用于显示设置引导，而非伪装个性化）。 */
export function hasNoPreferences(filters: RadarResponse['filters']): boolean {
  return filters.cities.length === 0 && filters.distances.length === 0 && filters.focusTags.length === 0;
}

/** 分组展示配置：key -> 标题。无偏好时 matched 组显示"近期值得关注"。 */
export const radarGroupDisplay: Record<RadarPrimaryGroup, string> = {
  closingSoon: '即将截止',
  signupOpening: '本周开报',
  recentlyChanged: '最近确认的变化',
  matched: '更符合你的偏好',
};

/** 雷达分组在页面上的展示顺序（与后端优先级一致）。 */
export const radarGroupOrder: RadarPrimaryGroup[] = [
  'closingSoon',
  'signupOpening',
  'recentlyChanged',
  'matched',
];

export interface RadarDisplayGroup {
  key: RadarPrimaryGroup;
  title: string;
  items: RadarEventSummary[];
}

/**
 * 把雷达响应的四组映射为有序、带标题的展示分组（过滤空组）。
 * 无偏好时 matched 组标题改为"近期值得关注"（交接文档 §6.3）。
 */
export function toDisplayGroups(response: RadarResponse): RadarDisplayGroup[] {
  const noPref = hasNoPreferences(response.filters);
  return radarGroupOrder
    .map((key) => {
      const items = response.groups[key] || [];
      return {
        key,
        title: key === 'matched' && noPref ? '近期值得关注' : radarGroupDisplay[key],
        items,
      };
    })
    .filter((g) => g.items.length > 0);
}

/** 汇总：各类命中数量（用于副标题"命中 N 场赛事"）。 */
export function radarTotalCount(response: RadarResponse): number {
  return response.total;
}

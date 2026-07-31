/**
 * V0.6 雷达分组判定与确定性匹配分（纯函数，无 DB 依赖）。
 *
 * 口径来自交接文档 §6.4 / §6.5：
 * - 四组：本周开报 / 即将截止 / 最近确认的变化 / 更符合偏好；
 * - 主分组优先级：即将截止 > 本周开报 > 最近确认的变化 > 更符合偏好；
 * - 匹配分为确定性累加，不依赖模型推测；
 * - matchReasons 只由实际字段生成，不输出"推荐报名"等替用户决策的结论。
 *
 * 输入为已投影的事件字段（不依赖 prisma 行），便于单测。
 */
import {
  radarDistanceValues,
  type RadarDistance,
  type RadarFilters,
  type RadarPrimaryGroup,
} from './radar.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 雷达分组判定所需的赛事字段（已投影、公开、脱敏）。 */
export interface RadarEventInput {
  id: string;
  city: string;
  eventDate: string; // YYYY-MM-DD
  distanceItems: string[];
  signupStatus: string;
  signupStartAt: string | null; // ISO
  signupDeadline: string | null; // ISO
  runJudgement: string;
  infoStatus: string;
  sourceLevel: string;
  tags: string[];
  /** 最近 14 天内是否有 applied 状态的变化告警（路由侧预计算） */
  hasRecentAppliedChange: boolean;
}

/**
 * 判定"本周开报"（交接文档 §6.4）：
 * - signupStartAt 在未来 7 天内；或
 * - 当前 signup_open 且 signupStartAt 在过去 7 天内。
 */
export function isSignupOpening(ev: RadarEventInput, now: Date = new Date()): boolean {
  if (!ev.signupStartAt) return false;
  const start = new Date(ev.signupStartAt).getTime();
  const diff = start - now.getTime();
  if (diff >= 0 && diff <= 7 * DAY_MS) return true; // 未来 7 天内
  if (ev.signupStatus === 'signup_open' && diff < 0 && -diff <= 7 * DAY_MS) return true; // 过去 7 天内且仍开放
  return false;
}

/**
 * 判定"即将截止"（交接文档 §6.4）：
 * - signupStatus = closing_soon；或
 * - 当前 signup_open 且 signupDeadline 在未来 7 天内。
 */
export function isClosingSoon(ev: RadarEventInput, now: Date = new Date()): boolean {
  if (ev.signupStatus === 'closing_soon') return true;
  if (ev.signupStatus === 'signup_open' && ev.signupDeadline) {
    const diff = new Date(ev.signupDeadline).getTime() - now.getTime();
    if (diff >= 0 && diff <= 7 * DAY_MS) return true;
  }
  return false;
}

/** 判定"最近确认的变化"：仅 hasRecentAppliedChange（路由侧已按 applied+14天 预计算）。 */
export function isRecentlyChanged(ev: RadarEventInput): boolean {
  return ev.hasRecentAppliedChange;
}

/**
 * 计算确定性匹配分（交接文档 §6.4 评分表）。
 * 返回 { score, reasons }。无偏好时 score=0、reasons=[]（不伪装个性化）。
 */
export function computeMatchScore(
  ev: RadarEventInput,
  filters: RadarFilters,
  now: Date = new Date(),
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const wantsCities = filters.cities.length > 0;
  const wantsDistances = filters.distances.length > 0;

  // 城市命中（+30）。筛选语义：城市 OR；空 = 不限。
  if (wantsCities && filters.cities.includes(ev.city)) {
    score += 30;
    reasons.push(`城市符合你的偏好（${ev.city}）`);
  }

  // 距离命中（+25）。距离 OR；只按白名单规范化值匹配。
  if (wantsDistances) {
    const hitDistances = ev.distanceItems.filter((d) =>
      filters.distances.includes(d as RadarDistance),
    );
    if (hitDistances.length > 0) {
      score += 25;
      reasons.push(`${hitDistances.join('、')} 距离`);
    }
  }

  // 关注点命中（每个 +10，最多 +30）。只按规范化真实标签匹配。
  if (filters.focusTags.length > 0) {
    const normalizedTags = ev.tags.map((t) => t.trim());
    const hitTags = filters.focusTags.filter((t) => normalizedTags.includes(t));
    if (hitTags.length > 0) {
      score += Math.min(hitTags.length * 10, 30);
      reasons.push(`关注点：${hitTags.slice(0, 3).join('、')}`);
    }
  }

  if (ev.runJudgement === 'priority') {
    score += 10;
  } else if (ev.runJudgement === 'watch') {
    score += 3;
  }

  if (isSignupOpening(ev, now) || isClosingSoon(ev, now)) {
    score += 5;
  }

  if (ev.infoStatus === 'verified') {
    score += 10;
  }

  if (ev.sourceLevel === 'official' || ev.sourceLevel === 'trusted') {
    score += 5;
  }

  // 比赛日期在未来 30 天内（+5）。eventDate 是北京日 YYYY-MM-DD。
  const eventDateMs = new Date(`${ev.eventDate}T00:00:00.000Z`).getTime();
  const diff = eventDateMs - now.getTime();
  if (diff >= 0 && diff <= 30 * DAY_MS) {
    score += 5;
  }

  return { score, reasons };
}

/** 报名紧迫度（用于排序 tie-break）：越紧迫数值越大。 */
export function signupUrgency(ev: RadarEventInput, now: Date = new Date()): number {
  if (ev.signupStatus === 'closing_soon') return 4;
  if (ev.signupStatus === 'signup_open' && ev.signupDeadline) {
    const diff = new Date(ev.signupDeadline).getTime() - now.getTime();
    if (diff >= 0 && diff <= 7 * DAY_MS) return 3; // 一周内截止
  }
  if (isSignupOpening(ev, now)) return 2;
  if (ev.signupStatus === 'signup_open') return 1;
  return 0;
}

/**
 * 决定赛事的主分组（按优先级：即将截止 > 本周开报 > 最近确认变化 > 更符合偏好）。
 * 返回 null 表示该赛事不进入任何雷达分组（如纯历史/已截止赛事，但公开未来赛事一般至少进 matched）。
 */
export function decidePrimaryGroup(
  ev: RadarEventInput,
  filters: RadarFilters,
  now: Date = new Date(),
): RadarPrimaryGroup | null {
  const closing = isClosingSoon(ev, now);
  const opening = isSignupOpening(ev, now);
  const changed = isRecentlyChanged(ev);
  const matched = computeMatchScore(ev, filters, now).score > 0;

  // 优先级判定
  if (closing) return 'closingSoon';
  if (opening) return 'signupOpening';
  if (changed) return 'recentlyChanged';
  if (matched) return 'matched';
  return null;
}

/**
 * 为一个赛事生成 badges（除主分组外的其他命中原因，交接文档 §6.5）。
 * 例如主分组是 matched，但赛事也本周开报，则 badges 含"本周开报"。
 */
export function buildBadges(
  ev: RadarEventInput,
  primaryGroup: RadarPrimaryGroup,
  now: Date = new Date(),
): string[] {
  const badges: string[] = [];
  if (primaryGroup !== 'closingSoon' && isClosingSoon(ev, now)) badges.push('即将截止');
  if (primaryGroup !== 'signupOpening' && isSignupOpening(ev, now)) badges.push('本周开报');
  if (primaryGroup !== 'recentlyChanged' && isRecentlyChanged(ev)) badges.push('近期有确认更新');
  if (ev.infoStatus === 'verified') badges.push('信息已核验');
  return badges;
}

/** 距离白名单导出（供路由侧校验复用）。 */
export { radarDistanceValues };

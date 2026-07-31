/**
 * V0.6 大湾区赛事雷达共享类型与工具。
 *
 * 设计原则：
 * - 城市白名单复用 index.ts 的 greaterBayAreaCities，不在此重复维护城市清单；
 * - 距离白名单与小程序偏好页 distanceOptions 保持一致（5K/10K/半马/全马/欢乐跑）；
 * - 合规文案集中定义，禁止改为具有交易或官方承诺含义的表达；
 * - 校验工具供 API Zod 之外的前置解析与小程序复用。
 */
import { normalizeGreaterBayAreaCity } from './region.js';

/* ----------------------------- 合规文案（不可变） ----------------------------- */

/** 固定合规说明，禁止改为交易或官方承诺含义。 */
export const RADAR_COMPLIANCE_NOTICE = 'AI 整理，仅供参考，报名以官方为准。';
/** 固定官方动作文案，禁止改为交易或官方承诺含义。 */
export const RADAR_OFFICIAL_ACTION_TEXT = '前往官方确认';

/* ----------------------------- 距离白名单 ----------------------------- */

/** 距离白名单，与小程序偏好页 distanceOptions 一致；只接受这些规范化值。 */
export const radarDistanceValues = ['5K', '10K', '半马', '全马', '欢乐跑'] as const;
export type RadarDistance = (typeof radarDistanceValues)[number];

/* ----------------------------- Campaign 类型（与 Prisma enum 对齐） ----------------------------- */

/** 渠道类型，与 schema.prisma GrowthCampaignType 枚举值一一对应。 */
export const growthCampaignTypeValues = [
  'wechat_group',
  'wechat_moments',
  'xiaohongshu',
  'running_club',
  'running_store',
  'coach',
  'photographer',
  'organizer',
  'public_account',
  'other',
] as const;
export type GrowthCampaignType = (typeof growthCampaignTypeValues)[number];

export const growthCampaignStatusValues = ['active', 'paused', 'archived'] as const;
export type GrowthCampaignStatus = (typeof growthCampaignStatusValues)[number];

/* ----------------------------- 关注点 ----------------------------- */

/** 关注点去重后最大数量。 */
export const RADAR_MAX_FOCUS_TAGS = 10;

/* ----------------------------- 窗口与分组限制 ----------------------------- */

export const RADAR_DEFAULT_WINDOW_DAYS = 90;
export const RADAR_MIN_WINDOW_DAYS = 30;
export const RADAR_MAX_WINDOW_DAYS = 180;

export const RADAR_DEFAULT_LIMIT_PER_GROUP = 20;
export const RADAR_HOME_PREVIEW_LIMIT = 3;
export const RADAR_MAX_LIMIT_PER_GROUP = 30;

/** 雷达四个分组标识，主分组优先级见 RADAR_PRIMARY_GROUP_PRIORITY。 */
export const radarPrimaryGroupValues = [
  'closingSoon',
  'signupOpening',
  'recentlyChanged',
  'matched',
] as const;
export type RadarPrimaryGroup = (typeof radarPrimaryGroupValues)[number];

/**
 * 主分组优先级（数字越小越优先）：即将截止 > 本周开报 > 最近确认的变化 > 更符合偏好。
 * 同一赛事只在一个主分组出现，其余命中原因以 badge 展示。
 */
export const RADAR_PRIMARY_GROUP_PRIORITY: Record<RadarPrimaryGroup, number> = {
  closingSoon: 0,
  signupOpening: 1,
  recentlyChanged: 2,
  matched: 3,
};

/* ----------------------------- 查询与响应类型 ----------------------------- */

export interface RadarFilters {
  cities: string[];
  distances: RadarDistance[];
  focusTags: string[];
}

export interface RadarQuery {
  cities?: string;
  distances?: string;
  focusTags?: string;
  windowDays?: number;
  campaign?: string;
  limitPerGroup?: number;
}

export interface RadarCampaignRef {
  code: string;
  accepted: boolean;
}

/** 雷达卡片摘要：在现有 EventSummary 之上扩展来源/核验/匹配字段。 */
export interface RadarEventSummary {
  id: string;
  eventName: string;
  city: string;
  eventDate: string;
  distanceItems: string[];
  signupStatus: string;
  signupStartAt: string | null;
  signupDeadline: string | null;
  officialUrl: string;
  sourceName: string;
  sourceLevel: 'official' | 'trusted' | 'community' | 'secondary' | 'unknown';
  sourceCheckedAt: string | null;
  infoStatus: string;
  runJudgement: string;
  primaryGroup: RadarPrimaryGroup;
  badges: string[];
  matchScore: number | null;
  matchReasons: string[];
}

export interface RadarGroup {
  signupOpening: RadarEventSummary[];
  closingSoon: RadarEventSummary[];
  recentlyChanged: RadarEventSummary[];
  matched: RadarEventSummary[];
}

export interface RadarResponse {
  generatedAt: string;
  window: { start: string; end: string; days: number };
  filters: RadarFilters;
  campaign: RadarCampaignRef | null;
  total: number;
  groups: RadarGroup;
  complianceNotice: typeof RADAR_COMPLIANCE_NOTICE;
  officialActionText: typeof RADAR_OFFICIAL_ACTION_TEXT;
}

/**
 * 开关关闭时的稳定响应：不暴露赛事，仍返回合法结构与合规文案，
 * 便于首页回退逻辑和小程序统一处理。
 */
export function radarDisabledResponse(now: Date = new Date()): RadarResponse {
  const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  return {
    generatedAt: now.toISOString(),
    window: {
      start: today.toISOString(),
      end: today.toISOString(),
      days: RADAR_DEFAULT_WINDOW_DAYS,
    },
    filters: { cities: [], distances: [], focusTags: [] },
    campaign: null,
    total: 0,
    groups: { signupOpening: [], closingSoon: [], recentlyChanged: [], matched: [] },
    complianceNotice: RADAR_COMPLIANCE_NOTICE,
    officialActionText: RADAR_OFFICIAL_ACTION_TEXT,
  };
}

/* ----------------------------- 查询参数解析工具 ----------------------------- */

/** 解析逗号分隔字符串为去重数组（保留原顺序，去空）。 */
export function parseCsvList(input: string | undefined | null): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(',')) {
    const v = raw.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** 将任意城市输入规范化为 canonical 大湾区城市（去重，丢弃非白名单值）。 */
export function parseRadarCities(input: string | undefined | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parseCsvList(input)) {
    const canonical = normalizeGreaterBayAreaCity(raw);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }
  }
  return out;
}

/** 只接受距离白名单内的值（去重）。 */
export function parseRadarDistances(input: string | undefined | null): RadarDistance[] {
  const allowed = new Set<string>(radarDistanceValues);
  const seen = new Set<string>();
  const out: RadarDistance[] = [];
  for (const raw of parseCsvList(input)) {
    if (allowed.has(raw) && !seen.has(raw)) {
      seen.add(raw);
      out.push(raw as RadarDistance);
    }
  }
  return out;
}

/** 关注点：去空白、去重，最多 RADAR_MAX_FOCUS_TAGS 个；不推测或改写标签。 */
export function parseRadarFocusTags(input: string | undefined | null): string[] {
  return parseCsvList(input).slice(0, RADAR_MAX_FOCUS_TAGS);
}

/** 将 windowDays 限制在合法区间，非法值回落默认。 */
export function clampWindowDays(input: number | undefined | null): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return RADAR_DEFAULT_WINDOW_DAYS;
  const n = Math.floor(input);
  if (n < RADAR_MIN_WINDOW_DAYS) return RADAR_MIN_WINDOW_DAYS;
  if (n > RADAR_MAX_WINDOW_DAYS) return RADAR_MAX_WINDOW_DAYS;
  return n;
}

/** 将 limitPerGroup 限制在合法区间，非法值回落默认。 */
export function clampLimitPerGroup(input: number | undefined | null): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return RADAR_DEFAULT_LIMIT_PER_GROUP;
  const n = Math.floor(input);
  if (n < 1) return 1;
  if (n > RADAR_MAX_LIMIT_PER_GROUP) return RADAR_MAX_LIMIT_PER_GROUP;
  return n;
}

/** 校验 Campaign code 形态：6-32 位小写字母/数字/短横线。不涉及私聊联系方式。 */
export function isValidCampaignCode(code: string | undefined | null): boolean {
  return typeof code === 'string' && /^[a-z0-9-]{6,32}$/.test(code);
}

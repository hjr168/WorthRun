export type PublishStatus = 'draft' | 'published' | 'hidden' | 'offline' | 'archived';

export type InfoStatus =
  'ai_generated' | 'pending_verify' | 'verified' | 'user_flagged' | 'source_error';

export type RunJudgement = 'priority' | 'watch' | 'unverified';

export type SignupStatus = 'signup_open' | 'closing_soon' | 'closed' | 'not_started' | 'unknown';

export type AdminRole = 'super_admin' | 'event_operator' | 'content_reviewer' | 'readonly';

export type FeedbackStatus = 'pending' | 'handling' | 'resolved' | 'rejected';

export type SourceLevel = 'official' | 'trusted' | 'community' | 'secondary' | 'unknown';

export const publishStatusLabels: Record<PublishStatus, string> = {
  draft: '草稿',
  published: '已发布',
  hidden: '前端隐藏',
  offline: '临时下架',
  archived: '已归档',
};

export const infoStatusLabels: Record<InfoStatus, string> = {
  ai_generated: 'AI 整理',
  pending_verify: '待核实',
  verified: '已核实',
  user_flagged: '用户反馈异常',
  source_error: '来源异常',
};

export const runJudgementLabels: Record<RunJudgement, string> = {
  priority: '适合优先关注',
  watch: '可以观望',
  unverified: '信息待核实',
};

export const signupStatusLabels: Record<SignupStatus, string> = {
  signup_open: '报名中',
  closing_soon: '即将截止',
  closed: '已截止',
  not_started: '未开始',
  unknown: '待核实',
};

export const sourceLevelLabels: Record<SourceLevel, string> = {
  official: '官方来源',
  trusted: '可信来源',
  community: '社区来源',
  secondary: '二级来源',
  unknown: '待核实',
};

export interface EventChecklistItemInput {
  groupName: string;
  itemName: string;
  itemStatus: InfoStatus;
  description?: string;
  sortOrder?: number;
}

export interface EventTagInput {
  tagName: string;
  tagType?: string;
}

export interface EventInput {
  eventName: string;
  city: string;
  eventDate: string;
  distanceItems: string[];
  startPoint?: string;
  endPoint?: string;
  signupStatus: SignupStatus;
  signupStartAt?: string | null;
  signupDeadline?: string | null;
  officialUrl: string;
  sourceName: string;
  sourceUrl?: string;
  sourceLevel: SourceLevel;
  publishStatus?: PublishStatus;
  infoStatus: InfoStatus;
  runJudgement: RunJudgement;
  judgementSummary?: string;
  judgementReasons?: string[];
  suitableFor?: string[];
  notSuitableFor?: string[];
  tags?: string[];
  fieldConfidence?: Record<string, InfoStatus>;
  checklistItems?: EventChecklistItemInput[];
  eventTags?: EventTagInput[];
}

export interface EventListQuery {
  search?: string;
  city?: string;
  signupStatus?: SignupStatus;
  publishStatus?: PublishStatus;
  infoStatus?: InfoStatus;
  runJudgement?: RunJudgement;
  page?: number;
  pageSize?: number;
}

/* 枚举值数组（as const），供后端 Zod 校验与前端下拉选项统一引用，避免三处重复定义。 */
export const publishStatusValues = ['draft', 'published', 'hidden', 'offline', 'archived'] as const;

export const infoStatusValues = [
  'ai_generated',
  'pending_verify',
  'verified',
  'user_flagged',
  'source_error',
] as const;

export const runJudgementValues = ['priority', 'watch', 'unverified'] as const;

export const signupStatusValues = [
  'signup_open',
  'closing_soon',
  'closed',
  'not_started',
  'unknown',
] as const;

export const sourceLevelValues = [
  'official',
  'trusted',
  'community',
  'secondary',
  'unknown',
] as const;

export const feedbackStatusValues = ['pending', 'handling', 'resolved', 'rejected'] as const;

export const adminRoleValues = [
  'super_admin',
  'event_operator',
  'content_reviewer',
  'readonly',
] as const;

export const greaterBayAreaCities = [
  '广州',
  '深圳',
  '珠海',
  '佛山',
  '惠州',
  '东莞',
  '中山',
  '江门',
  '肇庆',
  '香港',
  '澳门',
] as const;

export type GreaterBayAreaCity = (typeof greaterBayAreaCities)[number];

export const greaterBayAreaCityAliases: Record<GreaterBayAreaCity, string[]> = {
  广州: ['广州', '广州市', '广东省广州', '广东省广州市'],
  深圳: ['深圳', '深圳市', '广东省深圳', '广东省深圳市'],
  珠海: ['珠海', '珠海市', '广东省珠海', '广东省珠海市'],
  佛山: ['佛山', '佛山市', '广东省佛山', '广东省佛山市'],
  惠州: ['惠州', '惠州市', '广东省惠州', '广东省惠州市'],
  东莞: ['东莞', '东莞市', '广东省东莞', '广东省东莞市'],
  中山: ['中山', '中山市', '广东省中山', '广东省中山市'],
  江门: ['江门', '江门市', '广东省江门', '广东省江门市'],
  肇庆: ['肇庆', '肇庆市', '广东省肇庆', '广东省肇庆市'],
  香港: ['香港', '香港特别行政区'],
  澳门: ['澳门', '澳门特别行政区'],
};

export const greaterBayAreaCityValues = Object.values(greaterBayAreaCityAliases).flat();

export function normalizeGreaterBayAreaCity(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, '');
  for (const city of greaterBayAreaCities) {
    if (greaterBayAreaCityAliases[city].some((alias) => normalized === alias)) return city;
  }
  return null;
}

export function isGreaterBayAreaCity(value: string | null | undefined) {
  return normalizeGreaterBayAreaCity(value) !== null;
}

export function detectGreaterBayAreaCity(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, '');
  for (const city of greaterBayAreaCities) {
    const aliases = [...greaterBayAreaCityAliases[city]].sort((a, b) => b.length - a.length);
    if (aliases.some((alias) => normalized.includes(alias))) return city;
  }
  return null;
}

const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;

export function chinaDateOnly(now: Date = new Date()) {
  const chinaNow = new Date(now.getTime() + CHINA_TIME_OFFSET_MS);
  return [
    chinaNow.getUTCFullYear(),
    String(chinaNow.getUTCMonth() + 1).padStart(2, '0'),
    String(chinaNow.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function isFutureChinaDate(eventDate: string | null | undefined, now: Date = new Date()) {
  if (!eventDate) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return true;
  return eventDate > chinaDateOnly(now);
}

export * from './share.js';

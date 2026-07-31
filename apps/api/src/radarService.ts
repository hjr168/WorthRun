/**
 * V0.6 雷达查询服务。
 *
 * 职责（交接文档 §6 / §8.1）：
 * - 查询公开、未来、大湾区赛事（复用 buildPublicEventWhere）；
 * - 多城市 OR、多距离 OR、城市×距离 AND；
 * - 30-180 天窗口；
 * - 单次查询取齐展示字段，避免 N+1；
 * - 预计算每个赛事的 hasRecentAppliedChange（applied + 14 天内）；
 * - 用 radarGroups 纯函数分组、评分、生成理由与 badge；
 * - 主分组去重（同一赛事只在一个主分组），按优先级与稳定排序。
 *
 * 不返回：管理员备注、候选详情、原始 payload、未处理告警、用户标识、私有来源 URL。
 */
import { prisma } from '@worth-running/database';
import type { Prisma } from '@worth-running/database';
import {
  chinaDateOnly,
  greaterBayAreaCityValues,
  RADAR_COMPLIANCE_NOTICE,
  RADAR_OFFICIAL_ACTION_TEXT,
  clampLimitPerGroup,
  clampWindowDays,
  parseRadarCities,
  parseRadarDistances,
  parseRadarFocusTags,
  isValidCampaignCode,
  type RadarEventSummary,
  type RadarFilters,
  type RadarGroup,
  type RadarResponse,
} from '@worth-running/shared';
import {
  buildBadges,
  computeMatchScore,
  decidePrimaryGroup,
  isClosingSoon,
  isRecentlyChanged,
  isSignupOpening,
  signupUrgency,
  type RadarEventInput,
} from '@worth-running/shared';
import { resolveCampaignId } from './visitorGrowth.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RadarQueryInput {
  cities?: string;
  distances?: string;
  focusTags?: string;
  windowDays?: number;
  campaign?: string;
  limitPerGroup?: number;
}

export interface RadarQueryResult {
  response: RadarResponse;
  campaignId: string | null;
}

/**
 * 执行雷达查询。now 可注入便于测试（但 DB 访问本身不在单测内，由路由/冷烟覆盖）。
 */
export async function queryRadar(
  input: RadarQueryInput,
  now: Date = new Date(),
): Promise<RadarQueryResult> {
  const today = new Date(`${chinaDateOnly(now)}T00:00:00.000Z`);
  const windowDays = clampWindowDays(input.windowDays);
  const limitPerGroup = clampLimitPerGroup(input.limitPerGroup);
  const windowEnd = new Date(today.getTime() + windowDays * DAY_MS);

  const filters: RadarFilters = {
    cities: parseRadarCities(input.cities),
    distances: parseRadarDistances(input.distances),
    focusTags: parseRadarFocusTags(input.focusTags),
  };

  // Campaign 归因（无效 code 不影响查询，仅不归因）
  let campaignId: string | null = null;
  let campaignAccepted = false;
  if (input.campaign && isValidCampaignCode(input.campaign)) {
    campaignId = await resolveCampaignId(input.campaign, now).catch(() => null);
    campaignAccepted = campaignId !== null;
  }

  // 构建公开未来大湾区 where（复用 dataPolicy 语义）
  const where: Prisma.EventWhereInput = {
    publishStatus: 'published',
    city: { in: greaterBayAreaCityValues },
    eventDate: { gt: today, lte: windowEnd },
  };
  // 多城市 OR
  if (filters.cities.length > 0) {
    where.city = { in: filters.cities };
  }
  // 多距离 OR：用 AND of (distanceItems has d) 实现 OR-in-array 语义
  // 注意：跨维度城市×距离是 AND（Prisma where 默认 AND）。
  if (filters.distances.length === 1) {
    where.distanceItems = { has: filters.distances[0] };
  } else if (filters.distances.length > 1) {
    where.AND = filters.distances.map((d) => ({ distanceItems: { has: d } }));
  }

  // 单次查询取齐字段（避免 N+1）
  const rows = await prisma.event.findMany({
    where,
    select: {
      id: true,
      eventName: true,
      city: true,
      eventDate: true,
      distanceItems: true,
      signupStatus: true,
      signupStartAt: true,
      signupDeadline: true,
      officialUrl: true,
      sourceName: true,
      sourceLevel: true,
      sourceCheckedAt: true,
      infoStatus: true,
      runJudgement: true,
      tags: true,
      changeAlerts: {
        where: {
          status: 'applied',
          updatedAt: { gte: new Date(now.getTime() - 14 * DAY_MS) },
        },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: [{ eventDate: 'asc' }, { id: 'asc' }],
  });

  // 投影为 RadarEventInput + 生成 summary
  const summaries: RadarEventSummary[] = [];
  for (const row of rows) {
    const ev: RadarEventInput = {
      id: row.id,
      city: row.city,
      eventDate: row.eventDate.toISOString().slice(0, 10),
      distanceItems: row.distanceItems,
      signupStatus: row.signupStatus,
      signupStartAt: row.signupStartAt ? row.signupStartAt.toISOString() : null,
      signupDeadline: row.signupDeadline ? row.signupDeadline.toISOString() : null,
      runJudgement: row.runJudgement,
      infoStatus: row.infoStatus,
      sourceLevel: row.sourceLevel,
      tags: row.tags,
      hasRecentAppliedChange: row.changeAlerts.length > 0,
    };

    const primary = decidePrimaryGroup(ev, filters, now);
    if (!primary) continue; // 不进入任何分组则不展示

    const { score, reasons } = computeMatchScore(ev, filters, now);
    const badges = buildBadges(ev, primary, now);

    summaries.push({
      id: row.id,
      eventName: row.eventName,
      city: row.city,
      eventDate: ev.eventDate,
      distanceItems: row.distanceItems,
      signupStatus: row.signupStatus,
      signupStartAt: ev.signupStartAt,
      signupDeadline: ev.signupDeadline,
      officialUrl: row.officialUrl,
      sourceName: row.sourceName,
      sourceLevel: row.sourceLevel,
      sourceCheckedAt: row.sourceCheckedAt ? row.sourceCheckedAt.toISOString() : null,
      infoStatus: row.infoStatus,
      runJudgement: row.runJudgement,
      primaryGroup: primary,
      badges,
      matchScore: filters.cities.length || filters.distances.length || filters.focusTags.length ? score : null,
      matchReasons: reasons,
    });
  }

  // 主分组去重：同一赛事只在一个主分组（decidePrimaryGroup 已保证唯一 primaryGroup）
  const groups: RadarGroup = {
    closingSoon: [],
    signupOpening: [],
    recentlyChanged: [],
    matched: [],
  };
  const seen = new Set<string>();
  // 按主分组优先级处理：即将截止 > 本周开报 > 最近确认 > 更符合偏好
  const groupOrder: (keyof RadarGroup)[] = [
    'closingSoon',
    'signupOpening',
    'recentlyChanged',
    'matched',
  ];
  for (const g of groupOrder) {
    const inGroup = summaries
      .filter((s) => s.primaryGroup === g && !seen.has(s.id))
      .sort((a, b) => stableCompare(a, b, now));
    for (const s of inGroup) seen.add(s.id);
    groups[g] = inGroup.slice(0, limitPerGroup);
  }

  const response: RadarResponse = {
    generatedAt: now.toISOString(),
    window: {
      start: today.toISOString(),
      end: windowEnd.toISOString(),
      days: windowDays,
    },
    filters,
    campaign: input.campaign
      ? { code: input.campaign, accepted: campaignAccepted }
      : null,
    total: summaries.length,
    groups,
    complianceNotice: RADAR_COMPLIANCE_NOTICE,
    officialActionText: RADAR_OFFICIAL_ACTION_TEXT,
  };

  return { response, campaignId };
}

/**
 * 稳定排序（交接文档 §6.4）：
 * 1. 匹配分降序；2. 报名紧迫度降序；3. 比赛日期升序；4. 赛事 ID 升序。
 */
function stableCompare(a: RadarEventSummary, b: RadarEventSummary, now: Date): number {
  const sa = a.matchScore ?? 0;
  const sb = b.matchScore ?? 0;
  if (sb !== sa) return sb - sa;
  // 紧迫度需基于事件字段重新计算（summary 已含 signupStatus/deadline）
  const ua = signupUrgency(toInput(a), now);
  const ub = signupUrgency(toInput(b), now);
  if (ub !== ua) return ub - ua;
  if (a.eventDate !== b.eventDate) return a.eventDate < b.eventDate ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function toInput(s: RadarEventSummary): RadarEventInput {
  return {
    id: s.id,
    city: s.city,
    eventDate: s.eventDate,
    distanceItems: s.distanceItems,
    signupStatus: s.signupStatus,
    signupStartAt: s.signupStartAt,
    signupDeadline: s.signupDeadline,
    runJudgement: s.runJudgement,
    infoStatus: s.infoStatus,
    sourceLevel: s.sourceLevel,
    tags: [],
    hasRecentAppliedChange: false,
  };
}

// 重新导出纯函数便于路由/测试引用
export { isClosingSoon, isSignupOpening, isRecentlyChanged };

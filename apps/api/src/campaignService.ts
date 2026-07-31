/**
 * V0.6 增长渠道 Campaign 服务。
 *
 * 规则（交接文档 §8.3 / §9.1）：
 * - 创建后 code 不可修改；
 * - 可暂停/归档，不物理删除已使用 Campaign；
 * - code 为非敏感公开标识（6-32 位 [a-z0-9-]）；
 * - 不在 Campaign 中写私人微信号/手机号；partnerName 仅公开组织或账号名称；
 * - 创建/暂停/归档写管理员操作日志；
 * - Campaign 失效后历史归因仍保留（visitor 行 campaignId 仍指向该 Campaign）。
 */
import { prisma } from '@worth-running/database';
import { isValidCampaignCode, growthCampaignTypeValues } from '@worth-running/shared';
import type {
  GrowthCampaignStatus,
  GrowthCampaignType,
} from '@worth-running/shared';

// Prisma 模型行类型通过 Prisma 命名空间获取
import type { GrowthCampaign } from '@prisma/client';

export const campaignChannelTypeValues: GrowthCampaignType[] = [...growthCampaignTypeValues];

export const campaignStatusValues: GrowthCampaignStatus[] = ['active', 'paused', 'archived'];

export interface CreateCampaignInput {
  code: string;
  name: string;
  channelType: GrowthCampaignType;
  partnerName?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface UpdateCampaignInput {
  name?: string;
  channelType?: GrowthCampaignType;
  partnerName?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  status?: GrowthCampaignStatus;
}

/** 校验 Campaign code 形态，返回错误信息或 null。 */
export function validateCampaignCode(code: string): string | null {
  if (!isValidCampaignCode(code)) {
    return 'Campaign code 必须为 6-32 位小写字母、数字或短横线';
  }
  return null;
}

/** 校验有效期：开始不得晚于结束。 */
export function validateDateRange(
  startsAt?: string | null,
  endsAt?: string | null,
): string | null {
  if (startsAt && endsAt) {
    if (new Date(startsAt).getTime() > new Date(endsAt).getTime()) {
      return '有效期开始时间不能晚于结束时间';
    }
  }
  return null;
}

export async function createCampaign(
  input: CreateCampaignInput,
  adminUserId?: string,
): Promise<GrowthCampaign> {
  return prisma.growthCampaign.create({
    data: {
      code: input.code,
      name: input.name,
      channelType: input.channelType,
      partnerName: input.partnerName || null,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      createdBy: adminUserId,
    },
  });
}

export async function updateCampaign(
  id: string,
  input: UpdateCampaignInput,
): Promise<GrowthCampaign> {
  // 注意：code 不在 UpdateCampaignInput 中，因此天然不可修改。
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.channelType !== undefined) data.channelType = input.channelType;
  if (input.partnerName !== undefined) data.partnerName = input.partnerName || null;
  if (input.startsAt !== undefined) data.startsAt = input.startsAt ? new Date(input.startsAt) : null;
  if (input.endsAt !== undefined) data.endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (input.status !== undefined) data.status = input.status;
  return prisma.growthCampaign.update({ where: { id }, data });
}

/**
 * Campaign 漏斗统计（交接文档 §10.2）。
 * 全部基于 growth_visitor_daily 聚合，不返回任何用户标识。
 */
export async function getCampaignStats(campaignId: string, days: number, now: Date = new Date()) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const since = new Date(today.getTime() - (days - 1) * DAY_MS);
  const rows = await prisma.growthVisitorDaily.findMany({
    where: { campaignId, activityDate: { gte: since } },
    select: {
      viewedRadar: true,
      setPreference: true,
      addedFavorite: true,
      setChoice: true,
      subscribedReminder: true,
      copiedOfficial: true,
      startedShare: true,
      userId: true,
      visitorKeyHash: true,
    },
  });
  const unique = new Set(rows.map((r) => r.visitorKeyHash));
  const visitors = unique.size;
  const count = (pred: (r: (typeof rows)[number]) => boolean) =>
    new Set(rows.filter(pred).map((r) => r.visitorKeyHash)).size;
  const radarVisitors = count((r) => r.viewedRadar);
  const prefVisitors = count((r) => r.setPreference);
  const favoriteVisitors = count((r) => r.addedFavorite);
  const choiceVisitors = count((r) => r.setChoice);
  const reminderVisitors = count((r) => r.subscribedReminder);
  const officialVisitors = count((r) => r.copiedOfficial);
  const shareVisitors = count((r) => r.startedShare);
  const coreActionVisitors = count(
    (r) => r.addedFavorite || r.setChoice || r.subscribedReminder || r.copiedOfficial,
  );
  const newUsers = new Set(rows.filter((r) => r.userId).map((r) => r.visitorKeyHash)).size;
  const rate = (v: number, base: number) => (base ? Number(((v / base) * 100).toFixed(1)) : 0);

  // 查看两场以上不同赛事：基于 event view 事实表
  const twoPlusRows = await prisma.growthVisitorEventViewDaily.groupBy({
    by: ['visitorDailyId'],
    where: {
      visitorDaily: { campaignId, activityDate: { gte: since } },
    },
    _count: { eventId: true },
    having: { eventId: { _count: { gte: 2 } } },
  });
  const twoPlusVisitors = twoPlusRows.length;

  return {
    visitors,
    newUsers,
    radarVisitors,
    twoPlusVisitors,
    prefVisitors,
    favoriteVisitors,
    choiceVisitors,
    reminderVisitors,
    officialVisitors,
    coreActionVisitors,
    shareVisitors,
    visitorToCoreRate: rate(coreActionVisitors, visitors),
    // D7 留存仅成熟 cohort 可计算；此接口暂不返回（需注册日 cohort，留待汇总漏斗）
  };
}

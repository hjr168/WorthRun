/**
 * V0.6 匿名访客增长事实服务（Campaign 与匿名增长）。
 *
 * 设计（交接文档 §9.2 / §9.4）：
 * - visitorKeyHash 复用现有 userKeyHash（HMAC-SHA256，服务端密钥），不存明文 userKey；
 * - 同一访客同一天一行（@@unique([visitorKeyHash, activityDate])），动作幂等（重复不新增独立访客）；
 * - 三类归因分别保存，不强求二选一：campaignId / referralShareToken / firstChannel(direct)；
 * - 首次有效 Campaign 归因不覆盖、首次有效分享 token 不覆盖；
 * - 不同赛事浏览写入独立幂等事实表，可靠计算"查看至少 2 场不同赛事"；
 * - 匿名后登录：当日已有匿名活动补上 userId，而非新建第二条（不合并两个不同匿名哈希）。
 *
 * 纯函数部分（resolveAttribution / dayKey）单独可测，DB 写入在 recordVisitorActivity。
 */
import { prisma } from '@worth-running/database';
import { chinaDateOnly } from '@worth-running/shared';

export const VISITOR_DAY_MS = 24 * 60 * 60 * 1000;

/** 访客动作枚举（与 schema boolean 字段一一对应）。 */
export type VisitorAction =
  | 'viewedRadar'
  | 'setPreference'
  | 'addedFavorite'
  | 'setChoice'
  | 'subscribedReminder'
  | 'copiedOfficial'
  | 'startedShare';

export const visitorActionFields: ReadonlySet<VisitorAction> = new Set<VisitorAction>([
  'viewedRadar',
  'setPreference',
  'addedFavorite',
  'setChoice',
  'subscribedReminder',
  'copiedOfficial',
  'startedShare',
]);

/** 北京日界线日（Date，午夜 UTC 表示的北京日）。 */
export function visitorActivityDate(now: Date = new Date()): Date {
  return new Date(`${chinaDateOnly(now)}T00:00:00.000Z`);
}

/**
 * 解析归因：把外部传入的原始参数解析为"该次写入应使用的归因"。
 * 纯函数，便于单测。
 *
 * - campaignId：仅当 Campaign 存在且 active 且在有效期内才采纳；否则视为无效（不归因）；
 * - referralShareToken：调用方已校验过 token 有效性（见路由），这里仅透传；
 * - firstChannel：展示分类，由调用方按入口推断（如 'share' / 'campaign' / 'direct'）。
 */
export interface ResolvedAttribution {
  campaignId: string | null;
  referralShareToken: string | null;
  firstEntryPage: string | null;
  firstChannel: string | null;
}

export function resolveAttribution(input: {
  campaign?: string | null;
  resolvedCampaignId?: string | null; // 路由侧已查得的 campaignId（active 且有效）
  referralShareToken?: string | null;
  entryPage?: string | null;
  channel?: string | null;
}): ResolvedAttribution {
  return {
    campaignId: input.resolvedCampaignId ?? null,
    referralShareToken: input.referralShareToken ? input.referralShareToken : null,
    firstEntryPage: input.entryPage ? input.entryPage.trim().slice(0, 64) : null,
    firstChannel: input.channel ? input.channel.trim().slice(0, 64) : null,
  };
}

/**
 * 计算首次归因是否应写入：仅当目标字段当前为 null 时才写入新值（不覆盖）。
 * 用于 upsert 的 update 分支，保证"首日有效归因不覆盖"。
 */
export function mergeFirstTouch(
  current: { campaignId: string | null; referralShareToken: string | null; firstEntryPage: string | null; firstChannel: string | null },
  incoming: ResolvedAttribution,
): { campaignId?: string; referralShareToken?: string; firstEntryPage?: string; firstChannel?: string } {
  const update: { campaignId?: string; referralShareToken?: string; firstEntryPage?: string; firstChannel?: string } = {};
  // campaignId：当前已有有效 campaign 则不覆盖；否则采纳 incoming（可能为 null，则不动）
  if (current.campaignId === null && incoming.campaignId !== null) {
    update.campaignId = incoming.campaignId;
  }
  if (current.referralShareToken === null && incoming.referralShareToken !== null) {
    update.referralShareToken = incoming.referralShareToken;
  }
  if (current.firstEntryPage === null && incoming.firstEntryPage !== null) {
    update.firstEntryPage = incoming.firstEntryPage;
  }
  if (current.firstChannel === null && incoming.firstChannel !== null) {
    update.firstChannel = incoming.firstChannel;
  }
  return update;
}

export interface RecordVisitorActivityInput {
  visitorKeyHash: string;
  userId?: string | null;
  campaign?: string | null;
  resolvedCampaignId?: string | null;
  referralShareToken?: string | null;
  entryPage?: string | null;
  channel?: string | null;
  action?: VisitorAction;
  eventId?: string | null;
  now?: Date;
}

/**
 * 记录一次访客活动（幂等）。失败不抛出到业务层时由调用方决定是否吞掉（埋点不应阻塞主业务）。
 *
 * 注意：为避免并发首写竞争，采用 upsert；首次归因字段在 update 分支用条件更新（仅 null 时写）。
 */
export async function recordVisitorActivity(input: RecordVisitorActivityInput) {
  const now = input.now ?? new Date();
  const day = visitorActivityDate(now);
  const attribution = resolveAttribution(input);
  const actionField = input.action ? { [input.action]: true } : {};

  // 1. upsert 当日访客行
  const row = await prisma.growthVisitorDaily.upsert({
    where: { visitorKeyHash_activityDate: { visitorKeyHash: input.visitorKeyHash, activityDate: day } },
    create: {
      visitorKeyHash: input.visitorKeyHash,
      activityDate: day,
      userId: input.userId ?? null,
      campaignId: attribution.campaignId,
      referralShareToken: attribution.referralShareToken,
      firstEntryPage: attribution.firstEntryPage,
      firstChannel: attribution.firstChannel,
      ...actionField,
    },
    update: {
      ...actionField,
      // userId 补齐：当日已有匿名活动，登录后补上 userId（不新建第二条）
      ...(input.userId
        ? {
            userId: input.userId, // 直接覆盖为最新登录态（同一 visitorKeyHash 对应同一人）
          }
        : {}),
    },
  });

  // 2. 首次归因不覆盖：若 update 后仍为 null 而本次有值，条件更新
  const firstTouch = mergeFirstTouch(
    {
      campaignId: row.campaignId,
      referralShareToken: row.referralShareToken,
      firstEntryPage: row.firstEntryPage,
      firstChannel: row.firstChannel,
    },
    attribution,
  );
  if (Object.keys(firstTouch).length > 0) {
    await prisma.growthVisitorDaily.updateMany({
      where: { id: row.id },
      data: firstTouch,
    });
  }

  // 3. 不同赛事浏览：幂等写入事实表（仅 viewed_event_detail 动作带 eventId）
  if (input.eventId) {
    await prisma.growthVisitorEventViewDaily.upsert({
      where: { visitorDailyId_eventId: { visitorDailyId: row.id, eventId: input.eventId } },
      create: { visitorDailyId: row.id, eventId: input.eventId },
      update: {}, // 已存在则不动（幂等，firstViewedAt 保留首次）
    });
  }

  return row;
}

/**
 * 解析 Campaign code 到 campaignId：仅当存在、active、且在有效期内才返回 id。
 * 失效/暂停/归档/未知 code 返回 null（不归因，但访问仍记录为 direct）。
 */
export async function resolveCampaignId(code: string | null | undefined, now: Date = new Date()) {
  if (!code) return null;
  const campaign = await prisma.growthCampaign.findUnique({
    where: { code },
    select: { id: true, status: true, startsAt: true, endsAt: true },
  });
  if (!campaign) return null;
  if (campaign.status !== 'active') return null;
  if (campaign.startsAt && campaign.startsAt.getTime() > now.getTime()) return null;
  if (campaign.endsAt && campaign.endsAt.getTime() < now.getTime()) return null;
  return campaign.id;
}

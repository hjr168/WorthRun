import { randomBytes } from 'node:crypto';
import { prisma } from '@worth-running/database';
import { chinaDateOnly } from '@worth-running/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

export type GrowthAction =
  | 'viewedDetail'
  | 'copiedOfficial'
  | 'addedFavorite'
  | 'setChoice'
  | 'startedShare'
  | 'subscribedReminder';

export function activityDate(now = new Date()) {
  return new Date(`${chinaDateOnly(now)}T00:00:00.000Z`);
}

export function createShareToken() {
  return randomBytes(16).toString('base64url');
}

export async function recordUserActivity(input: {
  userId: string;
  entryPage?: string;
  channel?: string;
  referralShareToken?: string;
  action?: GrowthAction;
  now?: Date;
}) {
  const day = activityDate(input.now);
  const actionData = input.action ? { [input.action]: true } : {};
  await prisma.userActivityDaily.upsert({
    where: { userId_activityDate: { userId: input.userId, activityDate: day } },
    create: {
      userId: input.userId,
      activityDate: day,
      firstEntryPage: input.entryPage || null,
      firstChannel: input.channel || null,
      referralShareToken: input.referralShareToken || null,
      ...actionData,
    },
    update: {
      ...actionData,
    },
  });
  await Promise.all([
    input.entryPage
      ? prisma.userActivityDaily.updateMany({
          where: { userId: input.userId, activityDate: day, firstEntryPage: null },
          data: { firstEntryPage: input.entryPage },
        })
      : Promise.resolve(),
    input.channel
      ? prisma.userActivityDaily.updateMany({
          where: { userId: input.userId, activityDate: day, firstChannel: null },
          data: { firstChannel: input.channel },
        })
      : Promise.resolve(),
    input.referralShareToken
      ? prisma.userActivityDaily.updateMany({
          where: { userId: input.userId, activityDate: day, referralShareToken: null },
          data: { referralShareToken: input.referralShareToken },
        })
      : Promise.resolve(),
  ]);
  await prisma.user.update({
    where: { id: input.userId },
    data: { lastActiveAt: input.now ?? new Date() },
  });
}

export function retentionRate(input: {
  users: Array<{ id: string; registeredAt: Date }>;
  activeDays: Array<{ userId: string; activityDate: Date }>;
  offsetDays: 1 | 7;
  now: Date;
}) {
  const active = new Set(
    input.activeDays.map((row) => `${row.userId}:${row.activityDate.toISOString().slice(0, 10)}`),
  );
  const today = activityDate(input.now);
  const eligible = input.users.filter(
    (user) =>
      today.getTime() - activityDate(user.registeredAt).getTime() >= input.offsetDays * DAY_MS,
  );
  if (!eligible.length) return { eligible: 0, returned: 0, rate: 0 };
  const returned = eligible.filter((user) => {
    const target = new Date(activityDate(user.registeredAt).getTime() + input.offsetDays * DAY_MS);
    return active.has(`${user.id}:${target.toISOString().slice(0, 10)}`);
  }).length;
  return {
    eligible: eligible.length,
    returned,
    rate: Number(((returned / eligible.length) * 100).toFixed(1)),
  };
}

export async function getGrowthStats(days: 7 | 30, now = new Date()) {
  const today = activityDate(now);
  const since = new Date(today.getTime() - (days - 1) * DAY_MS);
  const [activities, registeredUsers, allCohortActivities, shareStarts] = await Promise.all([
    prisma.userActivityDaily.findMany({
      where: { activityDate: { gte: since } },
      include: { user: { select: { registeredAt: true } } },
    }),
    prisma.user.findMany({
      where: { registeredAt: { gte: since } },
      select: { id: true, registeredAt: true },
    }),
    prisma.userActivityDaily.findMany({
      where: { activityDate: { gte: new Date(since.getTime() - 7 * DAY_MS) } },
      select: { userId: true, activityDate: true },
    }),
    prisma.shareRecord.count({ where: { createdAt: { gte: since }, shareToken: { not: null } } }),
  ]);
  const unique = (predicate: (row: (typeof activities)[number]) => boolean) =>
    new Set(activities.filter(predicate).map((row) => row.userId)).size;
  const referralVisitors = unique((row) => Boolean(row.referralShareToken));
  const referralDetailUsers = unique((row) => Boolean(row.referralShareToken) && row.viewedDetail);
  const referredNewUsers = unique(
    (row) =>
      Boolean(row.referralShareToken) &&
      activityDate(row.user.registeredAt).getTime() === row.activityDate.getTime(),
  );
  const activeUsers = new Set(activities.map((row) => row.userId)).size;
  const rate = (value: number, base: number) =>
    base ? Number(((value / base) * 100).toFixed(1)) : 0;
  const detailUsers = unique((row) => row.viewedDetail);
  const officialUsers = unique((row) => row.copiedOfficial);
  const favoriteUsers = unique((row) => row.addedFavorite);
  const choiceUsers = unique((row) => row.setChoice);
  const shareUsers = unique((row) => row.startedShare);
  const reminderUsers = unique((row) => row.subscribedReminder);
  return {
    days,
    activeUsers,
    newUsers: registeredUsers.length,
    d1: retentionRate({
      users: registeredUsers,
      activeDays: allCohortActivities,
      offsetDays: 1,
      now,
    }),
    d7: retentionRate({
      users: registeredUsers,
      activeDays: allCohortActivities,
      offsetDays: 7,
      now,
    }),
    funnel: {
      detailUsers,
      officialUsers,
      favoriteUsers,
      choiceUsers,
      shareUsers,
      reminderUsers,
      detailRate: rate(detailUsers, activeUsers),
      officialRate: rate(officialUsers, detailUsers),
      favoriteRate: rate(favoriteUsers, detailUsers),
      choiceRate: rate(choiceUsers, detailUsers),
      shareRate: rate(shareUsers, detailUsers),
      reminderRate: rate(reminderUsers, detailUsers),
    },
    attribution: {
      shareStarts,
      referralVisitors,
      referredNewUsers,
      referralDetailUsers,
      referralToDetailRate: referralVisitors
        ? Number(((referralDetailUsers / referralVisitors) * 100).toFixed(1))
        : 0,
    },
  };
}

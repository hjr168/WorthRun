import { randomUUID } from 'node:crypto';
import { prisma } from '@worth-running/database';
import { decryptOpenId, secretKey } from './userIdentity.js';
import { buildReminderOptions, refreshPendingReminderSchedules } from './reminderWorkflow.js';

type WeChatSendResult = { errcode?: number; errmsg?: string };

async function accessToken(appId: string, appSecret: string) {
  const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
  url.searchParams.set('grant_type', 'client_credential');
  url.searchParams.set('appid', appId);
  url.searchParams.set('secret', appSecret);
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  const result = (await response.json()) as { access_token?: string } & WeChatSendResult;
  if (!response.ok || !result.access_token) {
    throw new Error(`wechat_token_${result.errcode || response.status}`);
  }
  return result.access_token;
}

function formatChinaDate(value: Date | null) {
  if (!value) return '待官方确认';
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}年${part('month')}月${part('day')}日`;
}

export function reminderMessageDate(input: {
  reminderType: 'signup' | 'race_week';
  trigger: 'signup_open' | 'signup_deadline_3d' | 'race_week_7d';
  signupDeadline: Date | null;
  eventDate: Date;
  now: Date;
}) {
  if (input.reminderType === 'race_week') return input.eventDate;
  if (input.trigger === 'signup_open') return input.now;
  return input.signupDeadline || input.eventDate;
}

type ReminderFieldConfig = {
  event: string;
  notice: string;
  date: string;
};

function reminderFields(prefix: 'SIGNUP' | 'RACE'): ReminderFieldConfig {
  return {
    event: process.env[`WX_${prefix}_REMINDER_EVENT_FIELD`]?.trim() || '',
    notice: process.env[`WX_${prefix}_REMINDER_NOTICE_FIELD`]?.trim() || '',
    date: process.env[`WX_${prefix}_REMINDER_DATE_FIELD`]?.trim() || '',
  };
}

function validReminderFields(fields: ReminderFieldConfig) {
  return Object.values(fields).every((value) =>
    /^(thing|date|time|phrase|character_string|number)\d+$/.test(value),
  );
}

function reminderData(input: {
  fields: ReminderFieldConfig;
  eventName: string;
  notice: string;
  date: Date | null;
}) {
  return {
    [input.fields.event]: { value: input.eventName.slice(0, 20) },
    [input.fields.notice]: { value: input.notice },
    [input.fields.date]: { value: formatChinaDate(input.date) },
  };
}

export async function deliverDueReminders(input: { dryRun: boolean; now?: Date; limit?: number }) {
  const now = input.now ?? new Date();
  const limit = Math.min(30, Math.max(1, input.limit ?? 30));
  if (!input.dryRun) {
    await prisma.eventReminder.updateMany({
      where: {
        status: 'sending',
        lockedAt: { lt: new Date(now.getTime() - 10 * 60_000) },
      },
      data: { status: 'pending', lockedAt: null, lockToken: null },
    });
    await refreshPendingReminderSchedules(now);
  }
  const due = await prisma.eventReminder.findMany({
    where: {
      status: 'pending',
      OR: [
        { scheduledAt: { lte: now } },
        {
          trigger: 'signup_open',
          scheduledAt: null,
          event: { signupStatus: { in: ['signup_open', 'closing_soon'] } },
        },
      ],
    },
    include: {
      user: true,
      event: { include: { changeAlerts: { where: { status: 'open' }, take: 1 } } },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  if (input.dryRun) {
    return { due: due.length, sent: 0, failed: 0, ids: due.map((item) => item.id) };
  }

  const appId = process.env.WX_APPID || '';
  const appSecret = process.env.WX_APPSECRET || '';
  const signupTemplate = process.env.WX_SIGNUP_REMINDER_TEMPLATE_ID || '';
  const raceTemplate = process.env.WX_RACE_REMINDER_TEMPLATE_ID || '';
  const signupFields = reminderFields('SIGNUP');
  const raceFields = reminderFields('RACE');
  const encryptionValue = process.env.USER_OPENID_ENCRYPTION_KEY || '';
  if (
    !appId ||
    !appSecret ||
    !signupTemplate ||
    !raceTemplate ||
    !encryptionValue ||
    !validReminderFields(signupFields) ||
    !validReminderFields(raceFields)
  ) {
    throw new Error('提醒发送配置不完整');
  }
  const key = secretKey(encryptionValue);
  const token = await accessToken(appId, appSecret);
  let sent = 0;
  let failed = 0;
  for (const reminder of due) {
    const options = buildReminderOptions(reminder.event, now);
    const option = options.find((item) => item.type === reminder.reminderType);
    if (!option?.available || reminder.user.status !== 'active') {
      await prisma.eventReminder.update({
        where: { id: reminder.id },
        data: {
          status: option?.available ? 'cancelled' : 'review_required',
          lastErrorCode: option?.reason || 'user_disabled',
        },
      });
      continue;
    }
    const lockToken = randomUUID();
    const locked = await prisma.eventReminder.updateMany({
      where: { id: reminder.id, status: 'pending' },
      data: { status: 'sending', lockedAt: now, lockToken, attempts: { increment: 1 } },
    });
    if (!locked.count) continue;
    try {
      const openId = decryptOpenId(
        {
          ciphertext: reminder.user.openIdCiphertext,
          iv: reminder.user.openIdIv,
          authTag: reminder.user.openIdAuthTag,
        },
        key,
      );
      const templateId = reminder.reminderType === 'signup' ? signupTemplate : raceTemplate;
      const fields = reminder.reminderType === 'signup' ? signupFields : raceFields;
      const response = await fetch(
        `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            touser: openId,
            template_id: templateId,
            page: `pages/event-detail/index?id=${reminder.eventId}`,
            miniprogram_state: process.env.WX_MINIPROGRAM_STATE || 'formal',
            lang: 'zh_CN',
            data: reminderData({
              fields,
              eventName: reminder.event.eventName,
              notice:
                reminder.reminderType === 'signup'
                  ? '报名信息请前往官方确认'
                  : '比赛将于一周后进行',
              date: reminderMessageDate({
                reminderType: reminder.reminderType,
                trigger: reminder.trigger,
                signupDeadline: reminder.event.signupDeadline,
                eventDate: reminder.event.eventDate,
                now,
              }),
            }),
          }),
          signal: AbortSignal.timeout(8_000),
        },
      );
      const result = (await response.json()) as WeChatSendResult;
      if (!response.ok || result.errcode) {
        throw new Error(`wechat_send_${result.errcode || response.status}`);
      }
      await prisma.eventReminder.update({
        where: { id: reminder.id },
        data: {
          status: 'sent',
          sentAt: now,
          lockedAt: null,
          lockToken: null,
          lastErrorCode: null,
        },
      });
      sent += 1;
    } catch (error) {
      const errorCode = error instanceof Error ? error.message.slice(0, 100) : 'send_failed';
      await prisma.eventReminder.update({
        where: { id: reminder.id },
        data: {
          status: reminder.attempts + 1 >= 3 ? 'failed' : 'pending',
          lastErrorCode: errorCode,
          lockedAt: null,
          lockToken: null,
        },
      });
      failed += 1;
    }
  }
  return { due: due.length, sent, failed, ids: due.map((item) => item.id) };
}

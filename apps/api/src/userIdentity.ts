import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Prisma, prisma } from '@worth-running/database';

const DAY_SECONDS = 24 * 60 * 60;

export class UserIdentityError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function secretKey(value: string) {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32) {
    throw new Error('USER_OPENID_ENCRYPTION_KEY 必须是 32 字节 Base64');
  }
  return decoded;
}

export function openIdHash(secret: string, openId: string) {
  return createHmac('sha256', secret).update(openId).digest('hex');
}

export function userKeyHash(secret: string, userKey: string) {
  return createHmac('sha256', secret).update(userKey).digest('hex');
}

export function encryptOpenId(openId: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(openId, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptOpenId(
  encrypted: { ciphertext: string; iv: string; authTag: string },
  key: Buffer,
) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function maskOpenId(openId: string) {
  if (openId.length <= 8) return `${openId.slice(0, 2)}****${openId.slice(-2)}`;
  return `${openId.slice(0, 4)}****${openId.slice(-4)}`;
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

export function createUserToken(userId: string, secret: string, now = Date.now()) {
  const payload = base64url(
    JSON.stringify({ userId, exp: Math.floor(now / 1000) + 30 * DAY_SECONDS }),
  );
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function parseUserToken(token: string, secret: string, now = Date.now()) {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) throw new UserIdentityError('用户登录已失效', 401);
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    throw new UserIdentityError('用户登录已失效', 401);
  }
  let parsed: { userId?: string; exp?: number };
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as typeof parsed;
  } catch {
    throw new UserIdentityError('用户登录已失效', 401);
  }
  if (!parsed.userId || !parsed.exp || parsed.exp < Math.floor(now / 1000)) {
    throw new UserIdentityError('用户登录已失效', 401);
  }
  return { userId: parsed.userId };
}

export async function exchangeWeChatCode(input: {
  code: string;
  appId: string;
  appSecret: string;
  fetcher?: typeof fetch;
}) {
  const fetcher = input.fetcher ?? fetch;
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', input.appId);
  url.searchParams.set('secret', input.appSecret);
  url.searchParams.set('js_code', input.code);
  url.searchParams.set('grant_type', 'authorization_code');
  const response = await fetcher(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new UserIdentityError('微信登录服务暂不可用', 503);
  const result = (await response.json()) as { openid?: string; errcode?: number };
  if (!result.openid) throw new UserIdentityError('微信登录失败', 400);
  return result.openid;
}

export async function linkAnonymousData(
  tx: Prisma.TransactionClient,
  userId: string,
  userKey: string,
  aliasHash: string,
) {
  const alias = await tx.userAlias.findUnique({ where: { userKeyHash: aliasHash } });
  if (alias && alias.userId !== userId) {
    throw new UserIdentityError('当前本机身份已绑定其他用户', 409);
  }
  await tx.userAlias.upsert({
    where: { userKeyHash: aliasHash },
    create: { userId, userKeyHash: aliasHash },
    update: { lastSeenAt: new Date() },
  });

  const anonymousPreference = await tx.userPreference.findUnique({ where: { userKey } });
  if (anonymousPreference && anonymousPreference.userId !== userId) {
    const currentPreference = await tx.userPreference.findUnique({ where: { userId } });
    if (!currentPreference) {
      await tx.userPreference.update({ where: { id: anonymousPreference.id }, data: { userId } });
    } else {
      if (anonymousPreference.updatedAt > currentPreference.updatedAt) {
        await tx.userPreference.update({
          where: { id: currentPreference.id },
          data: {
            cities: anonymousPreference.cities,
            distances: anonymousPreference.distances,
            focusTags: anonymousPreference.focusTags,
          },
        });
      }
      await tx.userPreference.delete({ where: { id: anonymousPreference.id } });
    }
  }

  const favorites = await tx.userFavorite.findMany({ where: { userKey } });
  for (const favorite of favorites) {
    if (favorite.userId === userId) continue;
    const existing = await tx.userFavorite.findFirst({
      where: { userId, eventId: favorite.eventId },
    });
    if (!existing) {
      await tx.userFavorite.update({ where: { id: favorite.id }, data: { userId } });
    } else {
      if (favorite.createdAt < existing.createdAt) {
        await tx.userFavorite.update({
          where: { id: existing.id },
          data: { createdAt: favorite.createdAt },
        });
      }
      await tx.userFavorite.delete({ where: { id: favorite.id } });
    }
  }

  const choices = await tx.userEventChoice.findMany({ where: { userKey } });
  for (const choice of choices) {
    if (choice.userId === userId) continue;
    const existing = await tx.userEventChoice.findFirst({
      where: { userId, eventId: choice.eventId },
    });
    if (!existing) {
      await tx.userEventChoice.update({ where: { id: choice.id }, data: { userId } });
    } else if (choice.updatedAt > existing.updatedAt) {
      await tx.userEventChoice.update({
        where: { id: existing.id },
        data: { choice: choice.choice },
      });
    }
    if (existing) await tx.userEventChoice.delete({ where: { id: choice.id } });
  }

  await Promise.all([
    tx.feedback.updateMany({ where: { userKey }, data: { userId } }),
    tx.shareRecord.updateMany({ where: { userKey }, data: { userId, userKeyHash: aliasHash } }),
  ]);
}

export async function registerWechatUser(input: {
  openId: string;
  userKey: string;
  hashSecret: string;
  encryptionKey: Buffer;
}) {
  const hash = openIdHash(input.hashSecret, input.openId);
  const aliasHash = userKeyHash(input.hashSecret, input.userKey);
  const encrypted = encryptOpenId(input.openId, input.encryptionKey);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { openIdHash: hash },
      create: {
        openIdHash: hash,
        openIdCiphertext: encrypted.ciphertext,
        openIdIv: encrypted.iv,
        openIdAuthTag: encrypted.authTag,
      },
      update: {
        lastLoginAt: new Date(),
        lastActiveAt: new Date(),
        openIdCiphertext: encrypted.ciphertext,
        openIdIv: encrypted.iv,
        openIdAuthTag: encrypted.authTag,
      },
    });
    await linkAnonymousData(tx, user.id, input.userKey, aliasHash);
    return user;
  });
}

export function publicUser(user: {
  id: string;
  nickname: string | null;
  avatarFileId: string | null;
  status: string;
  registeredAt: Date;
  lastActiveAt: Date;
}) {
  return {
    id: user.id,
    nickname: user.nickname,
    avatarFileId: user.avatarFileId,
    status: user.status,
    registeredAt: user.registeredAt,
    lastActiveAt: user.lastActiveAt,
  };
}

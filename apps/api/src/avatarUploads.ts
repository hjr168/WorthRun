import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '@worth-running/database';

export class AvatarUploadError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function digest(secret: string, value: string) {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function safeEqual(left: string, right: string) {
  return (
    left.length === right.length &&
    timingSafeEqual(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
  );
}

export async function createAvatarUploadGrant(input: {
  userId: string;
  secret: string;
  uploadUrl: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const token = randomBytes(32).toString('base64url');
  const grant = await prisma.$transaction(async (tx) => {
    await tx.avatarUploadGrant.updateMany({
      where: { userId: input.userId, status: { in: ['pending', 'consumed'] } },
      data: { status: 'failed' },
    });
    return tx.avatarUploadGrant.create({
      data: {
        userId: input.userId,
        tokenHash: digest(input.secret, token),
        expiresAt: new Date(now.getTime() + 5 * 60_000),
      },
    });
  });
  return { grantId: grant.id, token, uploadUrl: input.uploadUrl, expiresAt: grant.expiresAt };
}

export async function consumeAvatarUploadGrant(input: {
  grantId: string;
  token: string;
  secret: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const updated = await prisma.avatarUploadGrant.updateMany({
    where: {
      id: input.grantId,
      tokenHash: digest(input.secret, input.token),
      status: 'pending',
      expiresAt: { gt: now },
    },
    data: { status: 'consumed', consumedAt: now },
  });
  if (updated.count !== 1) throw new AvatarUploadError('上传凭证无效或已过期', 401);
  const grant = await prisma.avatarUploadGrant.findUnique({ where: { id: input.grantId } });
  if (!grant) throw new AvatarUploadError('上传凭证不存在', 404);
  return {
    userId: grant.userId,
    objectPath: `avatars/${grant.userId}/${randomBytes(16).toString('hex')}`,
  };
}

export function signAvatarCallback(
  secret: string,
  input: { timestamp: string; grantId: string; fileId: string },
) {
  return digest(secret, `${input.timestamp}.${input.grantId}.${input.fileId}`);
}

export async function completeAvatarUpload(input: {
  grantId: string;
  fileId: string;
  timestamp: string;
  signature: string;
  secret: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const callbackAt = Number(input.timestamp);
  if (!Number.isFinite(callbackAt) || Math.abs(now.getTime() - callbackAt) > 5 * 60_000) {
    throw new AvatarUploadError('回调已过期', 401);
  }
  const expected = signAvatarCallback(input.secret, input);
  if (!safeEqual(expected, input.signature)) throw new AvatarUploadError('回调签名无效', 401);

  return prisma.$transaction(async (tx) => {
    const grant = await tx.avatarUploadGrant.findFirst({
      where: { id: input.grantId, status: 'consumed' },
    });
    if (!grant) throw new AvatarUploadError('上传凭证状态无效', 409);
    const previous = await tx.user.findUnique({
      where: { id: grant.userId },
      select: { avatarFileId: true },
    });
    const user = await tx.user.update({
      where: { id: grant.userId },
      data: { avatarFileId: input.fileId, profileUpdatedAt: now },
      select: { avatarFileId: true },
    });
    await tx.avatarUploadGrant.update({
      where: { id: grant.id },
      data: { status: 'completed', completedAt: now },
    });
    return { ...user, previousAvatarFileId: previous?.avatarFileId ?? null };
  });
}

export async function deleteAvatarFile(fileId: string | null) {
  const baseUrl = process.env.UNICLOUD_AVATAR_BASE_URL?.trim();
  const secret = process.env.UNICLOUD_AVATAR_SHARED_SECRET?.trim();
  if (!fileId || !baseUrl || !secret) return;
  const response = await fetch(baseUrl, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', 'x-worthrun-avatar-secret': secret },
    body: JSON.stringify({ fileId }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new AvatarUploadError('头像文件删除失败', 503);
}

export async function getAvatarTemporaryUrls(fileIds: Array<string | null | undefined>) {
  const unique = [...new Set(fileIds.filter((item): item is string => Boolean(item)))];
  const baseUrl = process.env.UNICLOUD_AVATAR_BASE_URL?.trim();
  const secret = process.env.UNICLOUD_AVATAR_SHARED_SECRET?.trim();
  if (!unique.length || !baseUrl || !secret) return new Map<string, string>();
  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-worthrun-avatar-secret': secret },
      body: JSON.stringify({ action: 'temporary-url', fileIds: unique }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return new Map<string, string>();
    const result = (await response.json()) as { urls?: Array<{ fileId: string; url: string }> };
    return new Map((result.urls ?? []).map((item) => [item.fileId, item.url]));
  } catch {
    return new Map<string, string>();
  }
}

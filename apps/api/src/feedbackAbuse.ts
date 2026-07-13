import { createHmac } from 'node:crypto';

export const publicFeedbackTypes = [
  '日期有误',
  '报名状态有误',
  '官方链接失效',
  '赛事取消 / 延期',
  '信息重复',
  '其他',
] as const;

export const feedbackRateLimits = {
  userEvent: { scope: 'user_event_10m', windowMs: 10 * 60 * 1000, limit: 1 },
  ipShort: { scope: 'ip_10m', windowMs: 10 * 60 * 1000, limit: 5 },
  ipDaily: { scope: 'ip_24h', windowMs: 24 * 60 * 60 * 1000, limit: 20 },
} as const;

export function normalizeFeedbackContent(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function hmacDigest(secret: string, value: string) {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function createFeedbackFingerprint(
  secret: string,
  input: { eventId: string; feedbackType: string; content: string },
) {
  return hmacDigest(
    secret,
    `${input.eventId}\n${input.feedbackType}\n${normalizeFeedbackContent(input.content)}`,
  );
}

export function getWindowStart(now: Date, windowMs: number) {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

export function getRetryAfterSeconds(now: Date, windowMs: number) {
  const nextWindow = getWindowStart(now, windowMs).getTime() + windowMs;
  return Math.max(1, Math.ceil((nextWindow - now.getTime()) / 1000));
}

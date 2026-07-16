import { createHmac } from 'node:crypto';

export const publicFeedbackTypes = [
  '日期有误',
  '报名状态有误',
  '官方链接失效',
  '赛事取消 / 延期',
  '信息重复',
  '其他',
] as const;

export const feedbackRiskReasons = [
  'sql_probe',
  'jndi_probe',
  'script_probe',
  'path_probe',
  'control_character',
] as const;

export type FeedbackRiskReason = (typeof feedbackRiskReasons)[number];
export type FeedbackRisk =
  | { suspicious: false }
  | { suspicious: true; reason: FeedbackRiskReason };

export const feedbackRateLimits = {
  userEvent: { scope: 'user_event_10m', windowMs: 10 * 60 * 1000, limit: 1 },
  ipShort: { scope: 'ip_10m', windowMs: 10 * 60 * 1000, limit: 5 },
  ipDaily: { scope: 'ip_24h', windowMs: 24 * 60 * 60 * 1000, limit: 20 },
} as const;

export function normalizeFeedbackContent(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function classifyFeedbackRisk(value: string): FeedbackRisk {
  const content = normalizeFeedbackContent(value);
  if (/\u0000|[\u0001-\u0008\u000b\u000c\u000e-\u001f]/.test(content)) {
    return { suspicious: true, reason: 'control_character' };
  }
  if (/\$\{\s*jndi\s*:/i.test(content)) {
    return { suspicious: true, reason: 'jndi_probe' };
  }
  if (
    /\bunion\s+(?:all\s+)?select\b/i.test(content) ||
    /\b(?:sleep|benchmark)\s*\(/i.test(content) ||
    /(?:'|")\s*(?:or|and)\s+\d+\s*=\s*\d+/i.test(content)
  ) {
    return { suspicious: true, reason: 'sql_probe' };
  }
  if (/<script\b|javascript\s*:|\bon(?:error|load)\s*=/i.test(content)) {
    return { suspicious: true, reason: 'script_probe' };
  }
  if (/(?:\.\.\/){2,}|\/etc\/passwd/i.test(content)) {
    return { suspicious: true, reason: 'path_probe' };
  }
  return { suspicious: false };
}

export function isLowInformationFeedback(feedbackType: string, content: string) {
  const normalized = normalizeFeedbackContent(content);
  return normalized.length < 6 || normalized === normalizeFeedbackContent(feedbackType);
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

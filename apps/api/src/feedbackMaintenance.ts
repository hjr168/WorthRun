import { prisma } from '@worth-running/database';
import { chinaDateOnly } from '@worth-running/shared';
import type { FeedbackRiskReason } from './feedbackAbuse.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function chinaDay(now: Date) {
  return new Date(`${chinaDateOnly(now)}T00:00:00.000Z`);
}

export function buildFeedbackMaintenanceCutoffs(now: Date) {
  return {
    fingerprintExpiresAt: now,
    rateLimitBefore: new Date(now.getTime() - 48 * HOUR_MS),
    metricBefore: new Date(chinaDay(now).getTime() - 90 * DAY_MS),
    apiMetricBefore: new Date(now.getTime() - 30 * DAY_MS),
    credentialBefore: new Date(now.getTime() - 7 * DAY_MS),
  };
}

export async function recordBlockedFeedback(reason: FeedbackRiskReason, now: Date = new Date()) {
  return prisma.feedbackAbuseMetric.upsert({
    where: { day_reason: { day: chinaDay(now), reason } },
    create: { day: chinaDay(now), reason, count: 1 },
    update: { count: { increment: 1 } },
  });
}

export async function runFeedbackMaintenance(now: Date = new Date()) {
  const cutoffs = buildFeedbackMaintenanceCutoffs(now);
  const [fingerprints, rateLimits, metrics, apiMetrics, avatarGrants, shareTokens] =
    await prisma.$transaction([
      prisma.feedbackFingerprint.deleteMany({
        where: { expiresAt: { lte: cutoffs.fingerprintExpiresAt } },
      }),
      prisma.feedbackRateLimit.deleteMany({
        where: { windowStart: { lt: cutoffs.rateLimitBefore } },
      }),
      prisma.feedbackAbuseMetric.deleteMany({
        where: { day: { lt: cutoffs.metricBefore } },
      }),
      prisma.apiErrorMetric.deleteMany({
        where: { bucketStart: { lt: cutoffs.apiMetricBefore } },
      }),
      prisma.avatarUploadGrant.deleteMany({
        where: {
          createdAt: { lt: cutoffs.credentialBefore },
          OR: [{ status: { in: ['completed', 'failed'] } }, { expiresAt: { lt: now } }],
        },
      }),
      prisma.shareRecord.updateMany({
        where: { tokenExpiresAt: { lt: now }, shareToken: { not: null } },
        data: { shareToken: null, tokenExpiresAt: null },
      }),
    ]);
  return {
    deletedFingerprints: fingerprints.count,
    deletedRateLimits: rateLimits.count,
    deletedMetrics: metrics.count,
    deletedApiErrorMetrics: apiMetrics.count,
    deletedAvatarUploadGrants: avatarGrants.count,
    expiredShareTokens: shareTokens.count,
  };
}

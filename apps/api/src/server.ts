import { createHmac, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import type { CorsOptions } from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { Prisma, prisma } from '@worth-running/database';
import {
  AdminRole,
  feedbackStatusValues,
  infoStatusValues,
  publishStatusValues,
  defaultShareSettings,
  findUnknownShareVariables,
  isAllowedShareImageUrl,
  mergeShareSettings,
  resolveShareSetting,
  runJudgementValues,
  shareSceneValues,
  signupStatusValues,
  sourceLevelValues,
  getSupportedProvinces,
  resolveSupportedRegion,
  supportedProvinceCodes,
} from '@worth-running/shared';
import type {
  FeedbackStatus,
  GrowthCampaignStatus,
  GrowthCampaignType,
  InfoStatus,
  PublishStatus,
  RunJudgement,
  SignupStatus,
  SourceLevel,
  ShareSettings,
} from '@worth-running/shared';
import { z, ZodError } from 'zod';
import { aiEventCandidateSchema } from './ai/eventCandidateSchema.js';
import { eventSourceSchema } from './ai/eventSourceConfig.js';
import { classifyCandidate } from './ai/eventSourceOperations.js';
import {
  buildCandidateOrderBy,
  buildCandidateWhere,
  eventCandidateQuerySchema,
  eventSourceRunQuerySchema,
  nextRunAtForSourceConfig,
} from './ai/eventSourceQueries.js';
import { AiIngestError, runEventSource } from './ai/runEventSource.js';
import {
  classifyFeedbackRisk,
  createFeedbackFingerprint,
  feedbackRateLimits,
  getRetryAfterSeconds,
  getWindowStart,
  hmacDigest,
  normalizeFeedbackContent,
  eventCorrectionTypes,
  feedbackScopes,
  productFeedbackContextPages,
  productFeedbackTypes,
} from './feedbackAbuse.js';
import { publicFeedbackSchema, type PublicFeedbackInput } from './feedbackSubmission.js';
import { recordBlockedFeedback } from './feedbackMaintenance.js';
import { getMiniProgramCode } from './wxacode.js';
import { buildPublicEventWhere, isNationwideDiscoveryEnabled } from './dataPolicy.js';
import {
  assertSafeImageUrlResolved,
  extractImageCandidates,
  fetchPinnedHttps,
  imageDimensions,
  mediaSha256,
  validateImagePayload,
} from './mediaDiscovery.js';
import { EventMediaClient, EventMediaUnavailableError } from './eventMediaClient.js';
import { mediaDisplayMode, mediaReviewIssues, mediaUploadStatus } from './mediaGovernance.js';
import {
  DataCleanupConflictError,
  dataCleanupActions,
  getDataQualitySummary,
  runDataCleanup,
} from './dataGovernance.js';
import {
  getInteractionStats,
  interactionActions,
  recordEventInteraction,
} from './interactionAnalytics.js';
import {
  buildCandidateDuplicateGroups,
  getCandidateDuplicateGroups,
  mergeEventCandidates,
  candidateAcceptIssues,
} from './candidateWorkflow.js';
import { previewBulkAccept, runBulkAccept } from './candidateAcceptWorkflow.js';
import {
  eventPublishIssues,
  findPublishedEventDuplicates,
  previewBulkPublish,
  runBulkPublish,
} from './eventPublishWorkflow.js';
import {
  archiveDuplicatePublishedEvent,
  DuplicateEventGovernanceError,
} from './duplicateEventGovernance.js';
import {
  criticalEventFieldsChanged,
  getEventVerificationPage,
  getEventVerificationSummary,
  runBulkVerify,
} from './eventVerificationWorkflow.js';
import { buildFeedbackSummary, feedbackDisposition, runFeedbackBulk } from './feedbackWorkflow.js';
import { chinaDay } from './feedbackMaintenance.js';
import { apiRouteGroup, buildApiErrorSummary, recordApiErrorMetric } from './apiStability.js';
import { runGracefulShutdown } from './gracefulShutdown.js';
import {
  EventChangeConflictError,
  EventChangeNotFoundError,
  EventChangeResolutionError,
  eventChangeFields,
  eventChangeSignalFields,
  getEventChangeAlertSummary,
  listEventChangeAlerts,
  previewEventChangeResolution,
  resolveEventChangeAlert,
} from './eventChangeWorkflow.js';
import {
  EventChoiceNotFoundError,
  eventChoiceValues,
  getEventChoiceCounts,
  getViewerEventChoice,
  listViewerEventChoices,
  removeEventChoice,
  setEventChoice,
} from './eventChoiceWorkflow.js';
import { eventChoiceStatsSortValues, getAdminEventChoiceStats } from './eventChoiceStats.js';
import { SourceSummaryGenerationError } from './sourceSummaryGeneration.js';
import {
  SourceSummaryConflictError,
  SourceSummaryNotFoundError,
  SourceSummaryValidationError,
  createSourceSummaryDraft,
  getPublicSourceSummary,
  listSourceSummaries,
  publishSourceSummary,
  reverifyPublishedSourceSummary,
  updateSourceSummaryDraft,
} from './sourceSummaryWorkflow.js';
import {
  UserIdentityError,
  createUserToken,
  decryptOpenId,
  exchangeWeChatCode,
  maskOpenId,
  openIdHash,
  parseUserToken,
  publicUser,
  registerWechatUser,
  secretKey,
  userKeyHash,
} from './userIdentity.js';
import { createShareToken, getGrowthStats, recordUserActivity } from './growthAnalytics.js';
import {
  recordVisitorActivity,
  resolveCampaignId,
  visitorActivityDate,
  visitorActionFields,
  type VisitorAction,
} from './visitorGrowth.js';
import {
  campaignChannelTypeValues,
  createCampaign,
  getCampaignStats,
  updateCampaign,
  validateCampaignCode,
  validateDateRange,
} from './campaignService.js';
import { queryRadar } from './radarService.js';
import { radarDisabledResponse } from '@worth-running/shared';
import {
  buildReminderOptions,
  getReminderReadiness,
  getReminderStats,
  listAdminReminders,
  listReminderDeliveryRuns,
  reminderOptionsForEvent,
  subscribeReminders,
} from './reminderWorkflow.js';
import {
  AvatarUploadError,
  completeAvatarUpload,
  consumeAvatarUploadGrant,
  createAvatarUploadGrant,
  deleteAvatarFile,
  getAvatarTemporaryUrls,
  safeEqual,
} from './avatarUploads.js';

const app = express();
const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.HOST ?? '127.0.0.1';
const isProduction = process.env.NODE_ENV === 'production';
const allowDevAdmin = process.env.ALLOW_DEV_ADMIN === 'true';
const release = process.env.APP_RELEASE?.trim() || (isProduction ? 'unknown' : 'dev');

if (isProduction && !process.env.ADMIN_TOKEN_SECRET) {
  throw new Error('生产环境必须配置 ADMIN_TOKEN_SECRET');
}
if (isProduction && !process.env.FEEDBACK_ABUSE_SECRET) {
  throw new Error('生产环境必须配置 FEEDBACK_ABUSE_SECRET');
}
if (
  isProduction &&
  process.env.USER_SYSTEM_ENABLED === 'true' &&
  (!process.env.WX_APPID ||
    (process.env.WX_APPSECRET?.length || 0) < 16 ||
    (process.env.USER_TOKEN_SECRET?.length || 0) < 32 ||
    (process.env.USER_OPENID_HASH_SECRET?.length || 0) < 32 ||
    process.env.USER_TOKEN_SECRET === process.env.USER_OPENID_HASH_SECRET ||
    Buffer.from(process.env.USER_OPENID_ENCRYPTION_KEY || '', 'base64').length !== 32)
) {
  throw new Error('启用用户体系时必须配置微信登录与独立的高强度用户密钥');
}

const tokenSecret = process.env.ADMIN_TOKEN_SECRET || 'worth-running-dev-secret';
const feedbackAbuseSecret = process.env.FEEDBACK_ABUSE_SECRET || tokenSecret;
const userSystemEnabled = process.env.USER_SYSTEM_ENABLED === 'true';
const reminderFeatureEnabled = process.env.REMINDER_FEATURE_ENABLED === 'true';
// V0.6 大湾区赛事雷达开关。默认关闭，上线时先以 false 部署，体验版验证后再开启。
// 关闭时 /api/radar 返回稳定空结构（radarDisabledResponse），首页回退现有赛事分组。
const radarFeatureEnabled = process.env.RADAR_FEATURE_ENABLED === 'true';
const reminderRequestEnabled = (req: Request) =>
  reminderFeatureEnabled ||
  (process.env.WX_MINIPROGRAM_STATE === 'trial' && req.header('X-WX-MiniProgram-Env') === 'trial');
const userTokenSecret = process.env.USER_TOKEN_SECRET || tokenSecret;
const userHashSecret = process.env.USER_OPENID_HASH_SECRET || feedbackAbuseSecret;
const avatarSharedSecret = process.env.UNICLOUD_AVATAR_SHARED_SECRET || '';
const eventMediaSharedSecret = process.env.UNICLOUD_EVENT_MEDIA_SHARED_SECRET || '';
const eventMediaClient = new EventMediaClient({
  baseUrl: process.env.UNICLOUD_EVENT_MEDIA_BASE_URL,
  sharedSecret: eventMediaSharedSecret,
});
const userSystemConfigured = Boolean(
  process.env.WX_APPID &&
  process.env.WX_APPSECRET &&
  (process.env.USER_TOKEN_SECRET?.length || 0) >= 32 &&
  (process.env.USER_OPENID_HASH_SECRET?.length || 0) >= 32 &&
  process.env.USER_TOKEN_SECRET !== process.env.USER_OPENID_HASH_SECRET &&
  Buffer.from(process.env.USER_OPENID_ENCRYPTION_KEY || '', 'base64').length === 32,
);
const avatarConfigured = Boolean(
  /^https:\/\//.test(process.env.UNICLOUD_AVATAR_BASE_URL || '') && avatarSharedSecret.length >= 32,
);
const reminderFieldKeys = [
  process.env.WX_SIGNUP_REMINDER_EVENT_FIELD,
  process.env.WX_SIGNUP_REMINDER_NOTICE_FIELD,
  process.env.WX_SIGNUP_REMINDER_DATE_FIELD,
  process.env.WX_RACE_REMINDER_EVENT_FIELD,
  process.env.WX_RACE_REMINDER_NOTICE_FIELD,
  process.env.WX_RACE_REMINDER_DATE_FIELD,
];
const remindersConfigured = Boolean(
  process.env.WX_SIGNUP_REMINDER_TEMPLATE_ID &&
  process.env.WX_RACE_REMINDER_TEMPLATE_ID &&
  process.env.WX_SIGNUP_REMINDER_TEMPLATE_ID !== process.env.WX_RACE_REMINDER_TEMPLATE_ID &&
  reminderFieldKeys.every((value) =>
    /^(thing|date|time|phrase|character_string|number)\d+$/.test(value || ''),
  ),
);
if (isProduction && reminderFeatureEnabled && (!userSystemEnabled || !remindersConfigured)) {
  throw new Error('启用赛事提醒时必须先启用用户体系并配置订阅消息模板与字段');
}
const shareImageAllowedHosts = (process.env.SHARE_IMAGE_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const eventChoiceRateLimit = {
  scope: 'event-choice-user',
  windowMs: 60_000,
  limit: 30,
};
const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function isPrivateIpv4Host(hostname: string) {
  const parts = hostname.split('.').map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [first, second] = parts;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function isDevCorsOrigin(origin: string) {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    return (
      url.hostname === 'localhost' ||
      url.hostname === '::1' ||
      url.hostname === '[::1]' ||
      isPrivateIpv4Host(url.hostname)
    );
  } catch {
    return false;
  }
}

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (corsOrigins.includes(origin) || (!isProduction && isDevCorsOrigin(origin))) {
      callback(null, true);
      return;
    }
    callback(new HttpError(403, 'CORS origin not allowed'));
  },
};

// API 仅监听本机，由单层 Nginx 反向代理暴露；因此只信任最近一层代理提供的客户端地址。
app.set('trust proxy', 1);
app.use((req, res, next) => {
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.locals.requestStartedAt = Date.now();
  res.setHeader('X-Request-Id', requestId);
  next();
});
app.use(cors(corsOptions));
// 直接上传接口的 body 较大（base64 图片），在全局 1mb 解析器之前为该路径单独提高限制，
// 否则大 body 会在到达路由级中间件前被全局解析器拦截并抛 413，且该错误响应不带 CORS 头。
app.use('/api/admin/media-assets/upload', express.json({ limit: '12mb' }));
app.use(express.json({ limit: '1mb' }));

const complianceNotice = 'AI 整理，仅供参考，报名以官方为准。';
const officialActionText = '前往官方确认';
const defaultAdmin = { id: 'seed-admin', role: 'super_admin' as AdminRole };

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

class RateLimitError extends HttpError {
  constructor(
    message: string,
    public retryAfterSeconds: number,
  ) {
    super(429, message);
  }
}

function sourceSummaryHttpError(error: unknown): never {
  if (error instanceof SourceSummaryNotFoundError) throw new HttpError(404, error.message);
  if (error instanceof SourceSummaryConflictError) throw new HttpError(409, error.message);
  if (
    error instanceof SourceSummaryValidationError ||
    error instanceof SourceSummaryGenerationError
  ) {
    throw new HttpError(400, error.message);
  }
  throw error;
}

type AdminContext = { id: string; role: AdminRole };

const dateOnlySchema = z
  .string({ required_error: '比赛日期不能为空' })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '比赛日期格式应为 YYYY-MM-DD')
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), {
    message: '比赛日期无效',
  });

const optionalDateTimeSchema = z
  .preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().nullable(),
  )
  .refine((value) => value === null || !Number.isNaN(new Date(value).getTime()), {
    message: '日期时间格式无效',
  });

const stringArraySchema = z.array(z.string().trim().min(1)).default([]);

const checklistItemSchema = z.object({
  groupName: z.string().trim().min(1, '清单分组不能为空'),
  itemName: z.string().trim().min(1, '清单项名称不能为空'),
  itemStatus: z.enum(infoStatusValues),
  description: z.string().trim().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

const eventTagSchema = z.object({
  tagName: z.string().trim().min(1, '标签名不能为空'),
  tagType: z.string().trim().min(1).default('experience'),
});

const eventSchema = z.object({
  eventName: z.string().trim().min(1, '赛事名称不能为空'),
  city: z.string().trim().min(1, '城市不能为空'),
  provinceCode: z
    .string()
    .regex(/^\d{6}$/, '省代码必须是六位数字')
    .nullable()
    .optional(),
  cityCode: z
    .string()
    .regex(/^\d{6}$/, '市代码必须是六位数字')
    .nullable()
    .optional(),
  eventDate: dateOnlySchema,
  eventStartAt: optionalDateTimeSchema,
  distanceItems: z.array(z.string().trim().min(1)).min(1, '距离项目不能为空'),
  startPoint: z.string().trim().optional().nullable(),
  endPoint: z.string().trim().optional().nullable(),
  signupStatus: z.enum(signupStatusValues, { required_error: '报名状态不能为空' }),
  signupStartAt: optionalDateTimeSchema,
  signupDeadline: optionalDateTimeSchema,
  officialUrl: z.string().trim().url('官方入口必须是有效 URL'),
  sourceName: z.string().trim().min(1, '来源名称不能为空'),
  sourceUrl: z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().url('来源链接必须是有效 URL').nullable(),
  ),
  sourceLevel: z.enum(sourceLevelValues, { required_error: '来源等级不能为空' }),
  publishStatus: z.enum(publishStatusValues).default('draft'),
  infoStatus: z.enum(infoStatusValues).default('pending_verify'),
  runJudgement: z.enum(runJudgementValues, { required_error: '跑前判断不能为空' }),
  judgementSummary: z.string().trim().optional().nullable(),
  judgementReasons: stringArraySchema,
  suitableFor: stringArraySchema,
  notSuitableFor: stringArraySchema,
  tags: stringArraySchema,
  fieldConfidence: z.record(z.enum(infoStatusValues)).default({}),
  checklistItems: z.array(checklistItemSchema).default([]),
  eventTags: z.array(eventTagSchema).default([]),
});

const statusChangeSchema = z.object({
  note: z.string().trim().max(200).optional(),
});

const loginSchema = z.object({
  username: z.string().trim().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
});

const feedbackHandleSchema = z.object({
  status: z.enum(['resolved', 'rejected', 'handling']),
  adminNote: z.string().trim().max(1000).optional().nullable(),
});

const systemConfigSchema = z.object({
  configValue: z.unknown().refine((value) => value !== undefined, 'configValue 不能为空'),
  description: z.string().trim().max(500).optional().nullable(),
});

const candidateReviewSchema = z.object({
  action: z.enum(['accept', 'reject']),
  rejectReason: z.string().trim().max(500).optional(),
});

const candidatePatchSchema = z.object({
  extractedData: aiEventCandidateSchema,
});

const mediaDiscoverSchema = z.object({
  pageUrl: z.string().url(),
  officialUrl: z.string().url(),
  sourceUrl: z.string().url().optional().nullable(),
});
const mediaAssetCreateSchema = z.object({
  eventId: z.string().optional().nullable(),
  candidateId: z.string().optional().nullable(),
  imageUrl: z.string().url(),
  sourcePageUrl: z.string().url(),
  attribution: z.string().trim().max(200).optional().nullable(),
  rightsNote: z.string().trim().max(500).optional().nullable(),
});
const mediaAssetUploadSchema = z.object({
  eventId: z.string().optional().nullable(),
  candidateId: z.string().optional().nullable(),
  imageBase64: z.string().min(1),
  fileName: z.string().trim().max(200).optional().default('upload'),
  attribution: z.string().trim().min(1).max(200),
  rightsNote: z.string().trim().max(500).optional().nullable(),
});
const mediaReviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'primary']),
  note: z.string().trim().max(500).optional().nullable(),
});
const editorialItemSchema = z.object({
  eventId: z.string().min(1),
  section: z.enum(['focus', 'editors_pick', 'signup_soon', 'recommended']),
  rank: z.number().int().min(0).max(50),
  note: z.string().trim().max(300).optional().nullable(),
});
const editorialPlanSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  items: z.array(editorialItemSchema).max(100),
});

const workflowSnapshotSchema = z.object({
  id: z.string().trim().min(1),
  updatedAt: z.string().datetime(),
});

const candidateMergeSchema = z.object({
  primaryId: z.string().trim().min(1),
  mergedIds: z.array(z.string().trim().min(1)).min(1).max(19),
});

const bulkAcceptSchema = z.object({
  candidateIds: z.array(z.string().trim().min(1)).min(1).max(20),
  dryRun: z.boolean().default(true),
  expected: z.array(workflowSnapshotSchema).max(20).optional(),
});

const bulkPublishSchema = z.object({
  eventIds: z.array(z.string().trim().min(1)).min(1).max(20),
  dryRun: z.boolean().default(true),
  expected: z.array(workflowSnapshotSchema).max(20).optional(),
});

const standardDataCleanupSchema = z.object({
  actions: z.array(z.enum(dataCleanupActions)).min(1, '请至少选择一项治理动作'),
  dryRun: z.boolean().default(true),
  expected: z.record(z.enum(dataCleanupActions), z.number().int().min(0)).optional(),
});

const duplicateRelatedCountsSchema = z.object({
  favorites: z.number().int().min(0),
  choices: z.number().int().min(0),
  reminders: z.number().int().min(0),
  feedback: z.number().int().min(0),
  shares: z.number().int().min(0),
  interactions: z.number().int().min(0),
  sourceSummaries: z.number().int().min(0),
});

const duplicateEventCleanupSchema = z.object({
  action: z.literal('archive_duplicate_published_event'),
  primaryId: z.string().trim().min(1),
  duplicateId: z.string().trim().min(1),
  dryRun: z.boolean().default(true),
  expected: z
    .object({
      primaryUpdatedAt: z.string().datetime(),
      duplicateUpdatedAt: z.string().datetime(),
      related: duplicateRelatedCountsSchema,
    })
    .optional(),
});

const dataCleanupSchema = z.union([standardDataCleanupSchema, duplicateEventCleanupSchema]);

const adminUserCreateSchema = z.object({
  username: z.string().trim().min(1, '用户名不能为空').max(50),
  password: z.string().min(6, '密码至少 6 位'),
  displayName: z.string().trim().min(1, '显示名不能为空'),
  role: z.enum(['super_admin', 'event_operator', 'content_reviewer', 'readonly']),
});

const adminUserUpdateSchema = z.object({
  role: z.enum(['super_admin', 'event_operator', 'content_reviewer', 'readonly']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  password: z.string().min(6).optional(),
  displayName: z.string().trim().min(1).optional(),
});

const preferenceSchema = z.object({
  userKey: z.string().trim().min(1, 'userKey 不能为空'),
  cities: stringArraySchema,
  provinceCodes: z.array(z.string().regex(/^\d{6}$/)).default([]),
  cityCodes: z.array(z.string().regex(/^\d{6}$/)).default([]),
  distances: stringArraySchema,
  focusTags: stringArraySchema,
});

const favoriteSchema = z.object({
  userKey: z.string().trim().min(1, 'userKey 不能为空'),
  eventId: z.string().trim().min(1, 'eventId 不能为空'),
});

const eventChoiceSchema = z.object({
  userKey: z.string().trim().min(1, 'userKey 不能为空').max(100, 'userKey 无效'),
  eventId: z.string().trim().min(1, 'eventId 不能为空'),
  choice: z.enum(eventChoiceValues),
});

const eventChoiceQuerySchema = z.object({
  userKey: z.string().trim().min(1, 'userKey 不能为空').max(100, 'userKey 无效'),
  choice: z.enum(eventChoiceValues).optional(),
});

const wechatAuthSchema = z.object({
  code: z.string().trim().min(1, 'code 不能为空').max(128),
  userKey: z.string().trim().min(1, 'userKey 不能为空').max(100),
});

const nicknameSchema = z
  .string()
  .trim()
  .max(32, '昵称不能超过 32 个字符')
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), '昵称包含不可用字符')
  .refine((value) => !value || !classifyFeedbackRisk(value).suspicious, '昵称格式异常');

const userProfileSchema = z.object({
  nickname: z.union([nicknameSchema, z.null()]).optional(),
  clearAvatar: z.boolean().optional(),
});

const activitySchema = z.object({
  entryPage: z.string().trim().max(64).optional(),
  channel: z.string().trim().max(64).optional(),
  referralShareToken: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{20,64}$/)
    .optional(),
  action: z
    .enum([
      'viewedDetail',
      'copiedOfficial',
      'addedFavorite',
      'setChoice',
      'startedShare',
      'viewedReminder',
      'requestedReminderPermission',
      'acceptedReminderPermission',
      'subscribedReminder',
    ])
    .optional(),
});

// V0.6 匿名访客增长埋点（无需登录）。
const visitorActivitySchema = z.object({
  userKey: z.string().trim().min(1, 'userKey 不能为空').max(100, 'userKey 无效'),
  action: z
    .enum([
      'viewed_radar',
      'viewed_event_detail',
      'set_preference',
      'added_favorite',
      'set_choice',
      'subscribed_reminder',
      'copied_official',
      'started_share',
    ])
    .optional(),
  eventId: z.string().trim().min(1).max(64).optional(),
  entryPage: z.string().trim().max(64).optional(),
  campaign: z.string().trim().max(64).optional(),
  referralShareToken: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{20,64}$/)
    .optional(),
});

// 把埋点动作名映射到 visitor daily 布尔字段（viewed_event_detail 走赛事浏览事实表）。
const visitorActionMap: Record<string, VisitorAction | 'viewed_event_detail'> = {
  viewed_radar: 'viewedRadar',
  viewed_event_detail: 'viewed_event_detail',
  set_preference: 'setPreference',
  added_favorite: 'addedFavorite',
  set_choice: 'setChoice',
  subscribed_reminder: 'subscribedReminder',
  copied_official: 'copiedOfficial',
  started_share: 'startedShare',
};

// V0.6 Campaign 管理。
const campaignChannelEnum = z.enum(campaignChannelTypeValues as [string, ...string[]]);
const createCampaignSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1).max(64),
  channelType: campaignChannelEnum,
  partnerName: z.string().trim().max(64).optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
});
const updateCampaignSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  channelType: campaignChannelEnum.optional(),
  partnerName: z.string().trim().max(64).optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  status: z.enum(['active', 'paused', 'archived']).optional(),
});

const reminderSubscriptionSchema = z.object({
  eventId: z.string().trim().min(1),
  acceptedTypes: z
    .array(z.enum(['signup', 'race_week']))
    .min(1)
    .max(2),
});

const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'disabled']).optional(),
  profile: z.enum(['complete', 'incomplete']).optional(),
  hasReminder: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(64).optional(),
  openId: z.string().trim().max(128).optional(),
  registeredFrom: z.string().datetime().optional(),
  registeredTo: z.string().datetime().optional(),
  activeFrom: z.string().datetime().optional(),
  activeTo: z.string().datetime().optional(),
});

const adminUserStatusSchema = z.object({ status: z.enum(['active', 'disabled']) });

const avatarGrantSchema = z.object({
  grantId: z.string().trim().min(1),
  token: z.string().trim().min(20),
});

const avatarCompleteSchema = z.object({
  grantId: z.string().trim().min(1),
  fileId: z.string().trim().min(1).max(1024),
  timestamp: z.string().trim().min(1),
  signature: z.string().trim().length(64),
});

const sourceSummaryUpdateSchema = z.object({
  summary: z.string().trim().min(80, '摘要至少 80 字').max(400, '摘要不能超过 400 字'),
  keyPoints: z.array(z.string().trim().min(1).max(120)).min(2).max(6),
  limitations: z.string().trim().max(200).optional().nullable(),
  expectedUpdatedAt: z.string().datetime(),
});

const sourceSummaryPublishSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
  note: z.string().trim().min(4, '发布备注至少 4 字').max(500),
});

const shareRecordSchema = z.object({
  userKey: z.string().trim().min(1, 'userKey 不能为空').max(100),
  eventId: z.string().trim().min(1).optional(),
  shareType: z.enum(['page_share', 'timeline_share', 'image_generate']),
  scene: z.enum([
    'event_detail',
    'after_favorite',
    'home',
    'events',
    'share_card',
    'tools',
    'source_summary',
    'release_notes',
    'personal_home',
  ]),
  requestShareToken: z.boolean().optional(),
});

const shareImageUrlSchema = z
  .string()
  .trim()
  .min(1, '分享图片不能为空')
  .superRefine((value, context) => {
    if (!isAllowedShareImageUrl(value, shareImageAllowedHosts)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: '分享图片必须是内置资源，或来自 SHARE_IMAGE_ALLOWED_HOSTS 的 HTTPS URL',
      });
    }
  });

const shareTitleTemplateSchema = z
  .string()
  .trim()
  .min(1, '分享标题不能为空')
  .max(120)
  .superRefine((value, context) => {
    const unknown = findUnknownShareVariables(value);
    if (unknown.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `未知模板变量：${unknown.join('、')}`,
      });
    }
  });

const shareSceneSettingSchema = z.object({
  titleTemplate: shareTitleTemplateSchema,
  imageUrl: shareImageUrlSchema,
});

const shareSettingsSchema = z.object({
  scenes: z.object(
    Object.fromEntries(shareSceneValues.map((scene) => [scene, shareSceneSettingSchema])) as Record<
      (typeof shareSceneValues)[number],
      typeof shareSceneSettingSchema
    >,
  ),
});

const eventShareOverrideSchema = z
  .object({
    titleTemplate: shareTitleTemplateSchema.nullable().optional(),
    imageUrl: shareImageUrlSchema.nullable().optional(),
  })
  .refine((value) => Boolean(value.titleTemplate || value.imageUrl), '请至少设置标题或图片之一');

const releaseChangeSchema = z.object({
  category: z.enum(['feature', 'improvement', 'fix']),
  description: z.string().trim().min(1, '变更说明不能为空').max(200),
});

const releaseNoteInputSchema = z.object({
  version: z
    .string()
    .trim()
    .regex(/^v\d+\.\d+\.\d+$/i, '版本号格式应为 Vx.y.z'),
  title: z.string().trim().min(1, '标题不能为空').max(80),
  summary: z.string().trim().max(500).nullable().optional(),
  changes: z.array(releaseChangeSchema).min(1, '请至少填写一项更新').max(20),
  releasedAt: z.string().datetime('更新时间格式无效'),
});

const interactionSchema = z.object({
  userKey: z.string().trim().min(1, 'userKey 不能为空').max(100),
  eventId: z.string().trim().min(1, 'eventId 不能为空'),
  action: z.enum(interactionActions),
});

const queryStringSchema = z.preprocess((value) => {
  if (Array.isArray(value)) return value[0];
  if (value === undefined || value === '') return undefined;
  return String(value).trim();
}, z.string().optional());

const paginationQuerySchema = z.object({
  page: z.coerce.number().int('page 必须是整数').min(1, 'page 必须大于等于 1').default(1),
  pageSize: z.coerce
    .number()
    .int('pageSize 必须是整数')
    .min(1, 'pageSize 必须大于等于 1')
    .max(100, 'pageSize 不能超过 100')
    .default(20),
});

const adminRemindersQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum(['pending', 'sending', 'sent', 'cancelled', 'expired', 'failed', 'review_required'])
    .optional(),
  reminderType: z.enum(['signup', 'race_week']).optional(),
  search: queryStringSchema,
});

const publicEventsQuerySchema = paginationQuerySchema.extend({
  search: queryStringSchema,
  city: queryStringSchema,
  provinceCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  cityCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  sort: z.enum(['date_asc', 'signup_deadline', 'latest']).default('date_asc'),
  distance: queryStringSchema,
  signupStatus: z.enum(signupStatusValues).optional(),
  runJudgement: z.enum(runJudgementValues).optional(),
});

const adminEventsQuerySchema = paginationQuerySchema.extend({
  search: queryStringSchema,
  city: queryStringSchema,
  signupStatus: z.enum(signupStatusValues).optional(),
  publishStatus: z.enum(publishStatusValues).optional(),
  infoStatus: z.enum(infoStatusValues).optional(),
  runJudgement: z.enum(runJudgementValues).optional(),
  sourceReviewPending: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

const eventVerificationQuerySchema = paginationQuerySchema.extend({
  city: queryStringSchema,
  issue: queryStringSchema,
  reminderEligible: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

const bulkVerifySchema = z
  .object({
    eventIds: z.array(z.string().trim().min(1)).min(1).max(20),
    dryRun: z.boolean().default(true),
    note: z.string().trim().min(4, '核验备注至少 4 个字').max(500),
    expected: z.array(workflowSnapshotSchema).max(20).optional(),
  })
  .superRefine((input, context) => {
    if (!input.dryRun && !input.expected) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expected'],
        message: '应用核验必须携带预览快照',
      });
    }
  });

const eventChoiceStatsQuerySchema = paginationQuerySchema
  .extend({
    search: queryStringSchema,
    publishStatus: z.enum(publishStatusValues).optional(),
    eventDateFrom: dateOnlySchema.optional(),
    eventDateTo: dateOnlySchema.optional(),
    sort: z.enum(eventChoiceStatsSortValues).default('total_desc'),
  })
  .refine(
    (value) =>
      !value.eventDateFrom || !value.eventDateTo || value.eventDateFrom <= value.eventDateTo,
    { message: '比赛日期起始值不能晚于结束值', path: ['eventDateFrom'] },
  );

const adminFeedbackQuerySchema = paginationQuerySchema.extend({
  status: z.enum(feedbackStatusValues).optional(),
  scope: z.enum(feedbackScopes).optional(),
  feedbackType: z.enum([...eventCorrectionTypes, ...productFeedbackTypes]).optional(),
  contextPage: z.enum(productFeedbackContextPages).optional(),
  eventScope: z.enum(['public', 'unpublished']).optional(),
  search: queryStringSchema,
});

const adminFeedbackDuplicateQuerySchema = z.object({
  hours: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(24),
});

const feedbackDuplicateResolveSchema = z.object({
  primaryId: z.string().trim().min(1),
  duplicateIds: z.array(z.string().trim().min(1)).min(1).max(100),
});

const feedbackBulkHandleSchema = z.object({
  feedbackIds: z.array(z.string().trim().min(1)).min(1).max(50),
  status: z.enum(['resolved', 'rejected']),
  adminNote: z.string().trim().min(1, '请填写处理备注').max(1000),
  dryRun: z.boolean().default(true),
  expected: z.array(workflowSnapshotSchema).max(50).optional(),
});

const operationLogsQuerySchema = paginationQuerySchema.extend({
  targetType: queryStringSchema,
  targetId: queryStringSchema,
  action: queryStringSchema,
});

const eventChangeAlertQuerySchema = paginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['open', 'applied', 'dismissed', 'archived_event', 'superseded']).optional(),
  severity: z.enum(['normal', 'important', 'critical']).optional(),
  changedField: z.enum([...eventChangeFields, ...eventChangeSignalFields]).optional(),
  search: queryStringSchema,
  eventId: z.string().trim().min(1).optional(),
});

const eventChangeResolveSchema = z
  .object({
    dryRun: z.boolean().default(true),
    action: z.enum(['apply_fields', 'dismiss', 'archive_event']),
    fields: z.array(z.enum(eventChangeFields)).max(eventChangeFields.length).optional(),
    note: z.string().trim().min(4, '处理备注至少 4 个字').max(500),
    expected: z
      .object({
        alertUpdatedAt: z.string().datetime(),
        eventUpdatedAt: z.string().datetime(),
      })
      .optional(),
  })
  .superRefine((input, context) => {
    if (!input.dryRun && !input.expected) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expected'],
        message: '应用处理必须携带预览快照',
      });
    }
  });

type PublicEventsQuery = {
  page: number;
  pageSize: number;
  search?: string;
  city?: string;
  provinceCode?: string;
  cityCode?: string;
  month?: string;
  sort: 'date_asc' | 'signup_deadline' | 'latest';
  distance?: string;
  signupStatus?: SignupStatus;
  runJudgement?: RunJudgement;
};

type AdminEventsQuery = {
  page: number;
  pageSize: number;
  search?: string;
  city?: string;
  signupStatus?: SignupStatus;
  publishStatus?: PublishStatus;
  infoStatus?: InfoStatus;
  runJudgement?: RunJudgement;
  sourceReviewPending?: boolean;
};

type AdminFeedbackQuery = {
  page: number;
  pageSize: number;
  status?: FeedbackStatus;
  scope?: (typeof feedbackScopes)[number];
  feedbackType?: (typeof eventCorrectionTypes)[number] | (typeof productFeedbackTypes)[number];
  contextPage?: (typeof productFeedbackContextPages)[number];
  eventScope?: 'public' | 'unpublished';
  search?: string;
};

type OperationLogsQuery = {
  page: number;
  pageSize: number;
  targetType?: string;
  targetId?: string;
  action?: string;
};

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

async function checkDatabase(timeoutMs = 2000) {
  const startedAt = Date.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('database health timeout')), timeoutMs);
      }),
    ]);
    return { ok: true as const, latencyMs: Date.now() - startedAt };
  } catch {
    return { ok: false as const, latencyMs: Date.now() - startedAt };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function validateBody<T>(schema: z.Schema<T>, value: unknown) {
  return schema.parse(value);
}

function validateQuery<T>(schema: z.Schema<T>, value: unknown) {
  return schema.parse(value);
}

function parseDate(value: string | null) {
  return value ? new Date(value) : null;
}

function parseEventDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function eventDataFromInput(input: Record<string, any>): Prisma.EventUncheckedCreateInput {
  const resolvedRegion = resolveSupportedRegion(input.city, input.cityCode);
  return {
    eventName: input.eventName,
    city: input.city,
    provinceCode: input.provinceCode || resolvedRegion?.provinceCode || null,
    cityCode: input.cityCode || resolvedRegion?.cityCode || null,
    eventDate: parseEventDate(input.eventDate),
    eventStartAt: parseDate(input.eventStartAt as string | null),
    distanceItems: input.distanceItems,
    startPoint: input.startPoint || null,
    endPoint: input.endPoint || null,
    signupStatus: input.signupStatus as SignupStatus,
    signupStartAt: parseDate(input.signupStartAt as string | null),
    signupDeadline: parseDate(input.signupDeadline as string | null),
    officialUrl: input.officialUrl,
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl,
    sourceLevel: input.sourceLevel as SourceLevel,
    publishStatus: input.publishStatus as PublishStatus,
    infoStatus: input.infoStatus as InfoStatus,
    runJudgement: input.runJudgement as RunJudgement,
    judgementSummary: input.judgementSummary || null,
    judgementReasons: input.judgementReasons,
    suitableFor: input.suitableFor,
    notSuitableFor: input.notSuitableFor,
    tags: input.tags,
    fieldConfidence: input.fieldConfidence as Prisma.InputJsonValue,
  };
}

function getBearerToken(req: Request) {
  const header = req.header('authorization');
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url');
}

function signPayload(payload: object) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', tokenSecret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function parseToken(token: string): AdminContext {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) throw new HttpError(401, '登录已失效，请重新登录');
  const expected = createHmac('sha256', tokenSecret).update(encoded).digest('base64url');
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) {
    throw new HttpError(401, '登录已失效，请重新登录');
  }
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new HttpError(401, '登录已失效，请重新登录');
  }
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
    adminUserId: string;
    role: AdminRole;
    exp: number;
  };
  if (!payload.adminUserId || !payload.role || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new HttpError(401, '登录已失效，请重新登录');
  }
  return { id: payload.adminUserId, role: payload.role };
}

function getAdmin(req: Request): AdminContext {
  const token = getBearerToken(req);
  if (token) return parseToken(token);
  if (!isProduction && allowDevAdmin) return defaultAdmin;
  throw new HttpError(401, '请先登录后台');
}

function userEncryptionKey() {
  const configured = process.env.USER_OPENID_ENCRYPTION_KEY;
  if (!configured) throw new HttpError(503, '用户服务尚未启用');
  return secretKey(configured);
}

async function getRequestUser(req: Request, required = false) {
  if (!userSystemEnabled && !required) return null;
  const token = getBearerToken(req);
  if (!token) {
    if (required) throw new HttpError(401, '请先完成微信登录');
    return null;
  }
  let userId: string;
  try {
    userId = parseUserToken(token, userTokenSecret).userId;
  } catch (error) {
    if (error instanceof UserIdentityError) throw new HttpError(error.status, error.message);
    throw error;
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(401, '用户登录已失效');
  if (user.status === 'disabled') throw new HttpError(403, '账号已被禁用');
  return user;
}

function requireUserFeature() {
  if (!userSystemEnabled) throw new HttpError(503, '用户服务尚未启用');
}

function requireInternalAvatarSecret(req: Request) {
  const supplied = req.header('x-worthrun-avatar-secret') || '';
  if (!avatarSharedSecret || !safeEqual(supplied, avatarSharedSecret)) {
    throw new HttpError(401, '云函数认证失败');
  }
}

function requireInternalEventMediaSecret(req: Request) {
  const supplied = req.header('x-worthrun-event-media-secret') || '';
  if (!eventMediaSharedSecret || !safeEqual(supplied, eventMediaSharedSecret)) {
    throw new HttpError(401, '媒体云函数认证失败');
  }
}

function requireRole(req: Request, allowed: AdminRole[]) {
  const admin = getAdmin(req);
  if (!allowed.includes(admin.role)) {
    throw new HttpError(403, '当前角色无权执行该操作');
  }
  return admin;
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$100000$${salt}$${hash}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [scheme, roundsText, salt, hash] = storedHash.split('$');
  if (scheme !== 'pbkdf2_sha256' || !roundsText || !salt || !hash) return false;
  const rounds = Number(roundsText);
  const candidate = pbkdf2Sync(password, salt, rounds, 32, 'sha256').toString('hex');
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
}

async function validatePublish(event: Parameters<typeof eventPublishIssues>[0]) {
  const issues = eventPublishIssues(event);
  if ((await findPublishedEventDuplicates(event)).length) {
    issues.push('duplicate_published_event');
  }
  if (issues.length) throw new HttpError(400, `发布前检查未通过：${issues.join('、')}`);
}

const defaultEventCoverUrl =
  process.env.EVENT_DEFAULT_COVER_URL || '/assets/images/event-cover-default.jpg';

/**
 * 为云存储图片 URL 追加阿里云 OSS 实时图片处理参数（支付宝云存储底层为 OSS）。
 *
 * 背景：早期上传的图片因云函数 sharp 未生效，hero/thumbnail 实际是未压缩原图（可达 ~900KB）。
 * 在下载 URL 上追加 x-oss-process 参数可让 OSS 在返回时实时压缩，对存量与新增图片都立即生效，
 * 无需重新上传文件。实测 900KB 原图 -> 列表缩略图约 17KB、详情大图约 49KB。
 *
 * 注意：临时 URL 已带 ?expire_at=&er_sign= 等查询参数，这里必须用 & 拼接。
 * 仅对 http(s) 真实地址生效，本地默认封面路径直接原样返回。
 */
const IMAGE_PROCESS_PRESETS = {
  // 列表/卡片小图：宽 640 + webp + 质量 75，实测约 16-18KB。
  thumbnail: 'image/resize,w_640/format,webp/quality,q_75',
  // 详情/焦点大图：宽 1600 + webp + 质量 80，实测约 48-50KB。
  hero: 'image/resize,w_1600/format,webp/quality,q_80',
} as const;

function withImageProcess(url: string | undefined | null, preset: keyof typeof IMAGE_PROCESS_PRESETS): string | undefined {
  if (!url || !/^https?:\/\//.test(url)) return url || undefined;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}x-oss-process=${IMAGE_PROCESS_PRESETS[preset]}`;
}

async function resolvePublicMedia(
  event: { mediaAssets?: Array<Record<string, any>> },
  temporaryUrls = new Map<string, string>(),
) {
  const primary = (event.mediaAssets || []).find(
    (asset) => asset.reviewStatus === 'approved_for_display' && asset.isPrimary,
  );
  const fallback = (event.mediaAssets || []).find(
    (asset) => asset.reviewStatus === 'approved_for_display',
  );
  const asset = primary || fallback;
  const heroUrl = asset?.cloudbaseFileId ? temporaryUrls.get(asset.cloudbaseFileId) : undefined;
  const thumbnailUrl = asset?.thumbnailFileId
    ? temporaryUrls.get(asset.thumbnailFileId)
    : undefined;
  return {
    coverImageUrl: withImageProcess(heroUrl, 'hero') || defaultEventCoverUrl,
    coverThumbnailUrl:
      withImageProcess(thumbnailUrl, 'thumbnail') ||
      withImageProcess(heroUrl, 'hero') ||
      defaultEventCoverUrl,
    coverAttribution: asset?.attribution || null,
    mediaAssetId: asset?.id || null,
    coverImageMode: asset ? mediaDisplayMode(asset) : 'aspectFill',
    coverImageWidth: asset?.width || null,
    coverImageHeight: asset?.height || null,
  };
}

async function resolvePublicMediaBatch(
  events: Array<{ mediaAssets?: Array<Record<string, any>> }>,
) {
  const fileIds = events.flatMap(
    (event) =>
      (event.mediaAssets || [])
        .filter((asset) => asset.reviewStatus === 'approved_for_display')
        .flatMap((asset) =>
          [asset.cloudbaseFileId, asset.thumbnailFileId].filter(Boolean),
        ) as string[],
  );
  let temporaryUrls = new Map<string, string>();
  if (fileIds.length && eventMediaClient.configured) {
    try {
      temporaryUrls = await eventMediaClient.temporaryUrls(fileIds);
    } catch {
      // 云函数暂不可用时公共接口继续返回真实存在的品牌默认封面。
    }
  }
  return Promise.all(events.map((event) => resolvePublicMedia(event, temporaryUrls)));
}

async function resolveAdminMediaPreviewUrls(
  items: Array<{
    cloudbaseFileId?: string | null;
    thumbnailFileId?: string | null;
    originalUrl?: string | null;
  }>,
) {
  const fileIds = items.flatMap(
    (item) => [item.thumbnailFileId, item.cloudbaseFileId].filter(Boolean) as string[],
  );
  let temporaryUrls = new Map<string, string>();
  if (fileIds.length && eventMediaClient.configured) {
    try {
      temporaryUrls = await eventMediaClient.temporaryUrls(fileIds);
    } catch {
      // 后台仍可查看原始来源地址，云函数恢复后再刷新临时预览地址。
    }
  }
  return items.map((item) => ({
    previewUrl:
      (item.cloudbaseFileId && temporaryUrls.get(item.cloudbaseFileId)) || item.originalUrl || null,
    thumbnailPreviewUrl:
      (item.thumbnailFileId && temporaryUrls.get(item.thumbnailFileId)) || item.originalUrl || null,
  }));
}

async function fetchMediaWithRedirectReview(imageUrl: string, allowedHosts: string[]) {
  let resolution = await assertSafeImageUrlResolved(imageUrl, allowedHosts);
  let current = resolution.url.toString();
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const response = await fetchPinnedHttps(resolution.url, resolution.addresses[0]);
    if (response.status >= 300 && response.status < 400) {
      const location = response.location;
      if (!location) throw new HttpError(400, '图片重定向缺少目标地址');
      resolution = await assertSafeImageUrlResolved(
        new URL(location, current).toString(),
        allowedHosts,
      );
      current = resolution.url.toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300)
      throw new HttpError(400, `图片下载失败：HTTP ${response.status}`);
    const mimeType = validateImagePayload({
      buffer: response.buffer,
      contentType: response.contentType,
      contentLength: response.contentLength,
    });
    return { buffer: response.buffer, mimeType, finalUrl: current };
  }
  throw new HttpError(400, '图片重定向次数超过限制');
}

function homeMonthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new HttpError(400, 'month 必须是 YYYY-MM');
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { start, end };
}

function homeEventScore(event: any, preference: any) {
  const regionMatch =
    (preference?.cityCodes || []).includes(event.cityCode) ||
    (preference?.provinceCodes || []).includes(event.provinceCode) ||
    (preference?.cities || []).includes(event.city);
  const distanceMatch = (preference?.distances || []).some((item: string) =>
    event.distanceItems.some(
      (distance: string) => distance.includes(item) || item.includes(distance),
    ),
  );
  const tagMatch = (preference?.focusTags || []).filter((tag: string) =>
    event.tags.includes(tag),
  ).length;
  return (
    (regionMatch ? 100 : 0) +
    (distanceMatch ? 30 : 0) +
    tagMatch * 10 +
    (event.sourceLevel === 'official' ? 20 : event.sourceLevel === 'trusted' ? 10 : 0) +
    (event.eventStartAt ? 5 : 0) +
    (event.runJudgement === 'priority' ? 8 : 0)
  );
}

async function writeOperationLog(params: {
  adminUserId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  beforeValue?: unknown;
  afterValue?: unknown;
  note?: string;
}) {
  await prisma.adminOperationLog.create({
    data: {
      adminUserId: params.adminUserId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      beforeValue: params.beforeValue as Prisma.InputJsonValue,
      afterValue: params.afterValue as Prisma.InputJsonValue,
      note: params.note,
    },
  });
}

async function getPublicShareSettings(): Promise<ShareSettings> {
  const config = await prisma.systemConfig.findUnique({ where: { configKey: 'share_settings' } });
  return mergeShareSettings(
    config?.configValue,
    config?.updatedAt.toISOString() || defaultShareSettings.revision,
  );
}

function releaseNotePayload(input: z.infer<typeof releaseNoteInputSchema>) {
  return {
    version: input.version.toUpperCase(),
    title: input.title,
    summary: input.summary || null,
    changes: input.changes as Prisma.InputJsonValue,
    releasedAt: new Date(input.releasedAt),
  };
}

function encodeReleaseCursor(item: { id: string; releasedAt: Date }) {
  return Buffer.from(
    JSON.stringify({ id: item.id, releasedAt: item.releasedAt.toISOString() }),
  ).toString('base64url');
}

function decodeReleaseCursor(value: unknown) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8')) as {
      id?: string;
      releasedAt?: string;
    };
    if (!parsed.id || !parsed.releasedAt || Number.isNaN(new Date(parsed.releasedAt).getTime())) {
      throw new Error('invalid');
    }
    return { id: parsed.id, releasedAt: new Date(parsed.releasedAt) };
  } catch {
    throw new HttpError(400, 'cursor 无效');
  }
}

function getClientIp(req: Request) {
  return (req.ip || req.socket.remoteAddress || 'unknown').slice(0, 128);
}

async function consumeFeedbackRateLimit(
  tx: Prisma.TransactionClient,
  config: { scope: string; windowMs: number; limit: number },
  value: string,
  now: Date,
) {
  const windowStart = getWindowStart(now, config.windowMs);
  const keyHash = hmacDigest(feedbackAbuseSecret, `${config.scope}\n${value}`);
  const result = await tx.feedbackRateLimit.upsert({
    where: {
      scope_keyHash_windowStart: { scope: config.scope, keyHash, windowStart },
    },
    create: { scope: config.scope, keyHash, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });
  if (result.count > config.limit) {
    throw new RateLimitError(
      '提交过于频繁，请稍后再试',
      getRetryAfterSeconds(now, config.windowMs),
    );
  }
}

async function findExistingFeedback(requestId: string, fingerprint: string) {
  const byRequestId = await prisma.feedback.findUnique({ where: { requestId } });
  if (byRequestId) return byRequestId;
  const byFingerprint = await prisma.feedbackFingerprint.findUnique({
    where: { fingerprint },
    include: { feedback: true },
  });
  if (byFingerprint && byFingerprint.expiresAt > new Date()) return byFingerprint.feedback;
  return null;
}

function feedbackDuplicateKey(item: {
  eventId: string | null;
  userKey: string | null;
  scope?: string;
  feedbackType: string;
  content: string;
}) {
  return [
    item.eventId || '',
    item.scope || 'event_correction',
    item.userKey || '',
    item.feedbackType,
    normalizeFeedbackContent(item.content),
  ].join('\u0000');
}

app.get(
  '/api/admin/media-assets',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : undefined;
    const candidateId =
      typeof req.query.candidateId === 'string' ? req.query.candidateId : undefined;
    const items = await prisma.eventMediaAsset.findMany({
      where: { ...(eventId ? { eventId } : {}), ...(candidateId ? { candidateId } : {}) },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
    const previews = await resolveAdminMediaPreviewUrls(items);
    res.json({
      mediaServiceConfigured: eventMediaClient.configured,
      items: items.map((item, index) => ({
        ...item,
        ...previews[index],
        mediaUploadStatus: mediaUploadStatus(item, eventMediaClient.configured),
      })),
    });
  }),
);

app.post(
  '/api/admin/media-assets/discover',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(mediaDiscoverSchema, req.body);
    const official = new URL(input.officialUrl);
    const source = input.sourceUrl ? new URL(input.sourceUrl) : null;
    const allowedHosts = [official.hostname, ...(source ? [source.hostname] : [])];
    const pageResolution = await assertSafeImageUrlResolved(input.pageUrl, allowedHosts);
    const pageUrl = pageResolution.url.toString();
    const response = await fetchPinnedHttps(
      pageResolution.url,
      pageResolution.addresses[0],
      12_000,
      'text/html,application/xhtml+xml',
    );
    if (response.status < 200 || response.status >= 300)
      throw new HttpError(400, `确认来源页面读取失败：HTTP ${response.status}`);
    const html = response.buffer.toString('utf8');
    res.json({ pageUrl, candidates: extractImageCandidates(html, pageUrl) });
  }),
);

app.post(
  '/api/admin/media-assets',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(mediaAssetCreateSchema, req.body);
    if (Boolean(input.eventId) === Boolean(input.candidateId))
      throw new HttpError(400, '媒体必须且只能关联一个候选或赛事');
    if (!input.attribution?.trim()) throw new HttpError(400, '媒体必须填写图片署名');
    const page = new URL(input.sourcePageUrl);
    const owner = input.eventId
      ? await prisma.event.findUnique({
          where: { id: input.eventId },
          select: { officialUrl: true, sourceUrl: true },
        })
      : await prisma.eventCandidate.findUnique({
          where: { id: input.candidateId! },
          select: { officialUrl: true, sourceUrl: true },
        });
    if (!owner) throw new HttpError(404, '关联赛事或候选不存在');
    const allowedHosts = [
      new URL(owner.officialUrl || owner.sourceUrl || input.sourcePageUrl).hostname,
    ];
    if (owner.sourceUrl) allowedHosts.push(new URL(owner.sourceUrl).hostname);
    const fetched = await fetchMediaWithRedirectReview(input.imageUrl, allowedHosts);
    const sha256 = mediaSha256(fetched.buffer);
    const dimensions = imageDimensions(fetched.buffer, fetched.mimeType);
    const existing = await prisma.eventMediaAsset.findFirst({
      where: {
        sha256,
        ...(input.eventId ? { eventId: input.eventId } : { candidateId: input.candidateId }),
      },
    });
    if (existing) {
      res.json({
        ...existing,
        duplicate: true,
        mediaUploadStatus: mediaUploadStatus(existing, eventMediaClient.configured),
        mediaServiceConfigured: eventMediaClient.configured,
      });
      return;
    }
    const created = await prisma.eventMediaAsset.create({
      data: {
        eventId: input.eventId || null,
        candidateId: input.candidateId || null,
        originalUrl: fetched.finalUrl,
        sourcePageUrl: page.toString(),
        attribution: input.attribution || null,
        reviewNote: input.rightsNote || null,
        sha256,
        mimeType: fetched.mimeType,
        width: dimensions?.width || null,
        height: dimensions?.height || null,
        discoveredBy: admin.id,
      },
    });
    let saved = created;
    let uploadStatus: 'uploaded' | 'pending_configuration' | 'pending_retry' =
      'pending_configuration';
    if (eventMediaClient.configured) {
      try {
        const uploaded = await eventMediaClient.upload({
          assetId: created.id,
          buffer: fetched.buffer,
          mimeType: fetched.mimeType,
          filename: `event-cover.${fetched.mimeType.split('/')[1]}`,
        });
        saved = await prisma.eventMediaAsset.update({
          where: { id: created.id },
          data: {
            originalFileId: uploaded.originalFileId || null,
            cloudbaseFileId: uploaded.fileId,
            thumbnailFileId: uploaded.thumbnailFileId,
          },
        });
        uploadStatus = 'uploaded';
      } catch (error) {
        if (!(error instanceof EventMediaUnavailableError)) {
          // 云函数网络故障不应让来源发现记录丢失，后台可在配置恢复后重试上传。
        }
        uploadStatus = 'pending_retry';
      }
    }
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'event_media.discover',
      targetType: 'event_media_assets',
      targetId: saved.id,
      afterValue: saved,
      note:
        uploadStatus === 'uploaded'
          ? '从确认的官网/主办方页面发现并上传 CloudBase，待人工审核'
          : '从确认的官网/主办方页面发现图片，CloudBase 待配置或待重试',
    });
    res
      .status(201)
      .json({
        ...saved,
        mediaUploadStatus: uploadStatus,
        mediaServiceConfigured: eventMediaClient.configured,
      });
  }),
);

// 直接上传本地图片文件（base64 over JSON，避免引入 multipart 依赖）。
// body 限制已在全局 express.json 之前对该路径单独提高（见文件中部 app.use 处）。
app.post(
  '/api/admin/media-assets/upload',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(mediaAssetUploadSchema, req.body);
    if (Boolean(input.eventId) === Boolean(input.candidateId))
      throw new HttpError(400, '媒体必须且只能关联一个候选或赛事');
    const owner = input.eventId
      ? await prisma.event.findUnique({ where: { id: input.eventId }, select: { id: true } })
      : await prisma.eventCandidate.findUnique({
          where: { id: input.candidateId! },
          select: { id: true },
        });
    if (!owner) throw new HttpError(404, '关联赛事或候选不存在');
    // 去掉 dataURL 前缀（如有），还原二进制 buffer。
    const base64Data = input.imageBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const mimeType = validateImagePayload({ buffer });
    const sha256 = mediaSha256(buffer);
    const dimensions = imageDimensions(buffer, mimeType);
    const existing = await prisma.eventMediaAsset.findFirst({
      where: {
        sha256,
        ...(input.eventId ? { eventId: input.eventId } : { candidateId: input.candidateId }),
      },
    });
    if (existing) {
      res.json({
        ...existing,
        duplicate: true,
        mediaUploadStatus: mediaUploadStatus(existing, eventMediaClient.configured),
        mediaServiceConfigured: eventMediaClient.configured,
      });
      return;
    }
    const sourcePageUrl = 'https://worthrun.admin/local-upload';
    const created = await prisma.eventMediaAsset.create({
      data: {
        eventId: input.eventId || null,
        candidateId: input.candidateId || null,
        originalUrl: `本地上传:${input.fileName}`,
        sourcePageUrl,
        attribution: input.attribution,
        reviewNote: input.rightsNote || null,
        sha256,
        mimeType,
        width: dimensions?.width || null,
        height: dimensions?.height || null,
        discoveredBy: admin.id,
      },
    });
    let saved = created;
    let uploadStatus: 'uploaded' | 'pending_configuration' | 'pending_retry' =
      'pending_configuration';
    if (eventMediaClient.configured) {
      try {
        const uploaded = await eventMediaClient.upload({
          assetId: created.id,
          buffer,
          mimeType,
          filename: `event-cover.${mimeType.split('/')[1]}`,
        });
        saved = await prisma.eventMediaAsset.update({
          where: { id: created.id },
          data: {
            originalFileId: uploaded.originalFileId || null,
            cloudbaseFileId: uploaded.fileId,
            thumbnailFileId: uploaded.thumbnailFileId,
          },
        });
        uploadStatus = 'uploaded';
      } catch {
        uploadStatus = 'pending_retry';
      }
    }
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'event_media.discover',
      targetType: 'event_media_assets',
      targetId: saved.id,
      afterValue: saved,
      note:
        uploadStatus === 'uploaded'
          ? '后台直接上传图片至 CloudBase，待人工审核'
          : '后台直接上传图片，CloudBase 待配置或待重试',
    });
    res.status(201).json({
      ...saved,
      mediaUploadStatus: uploadStatus,
      mediaServiceConfigured: eventMediaClient.configured,
    });
  }),
);

app.post(
  '/api/admin/media-assets/:id/retry-upload',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    if (!eventMediaClient.configured)
      throw new HttpError(503, '媒体云函数尚未配置，暂不能重试上传');
    const asset = await prisma.eventMediaAsset.findUnique({ where: { id: req.params.id } });
    if (!asset) throw new HttpError(404, '媒体不存在');
    if (!asset.originalUrl) throw new HttpError(400, '媒体缺少原始图片地址，需重新发现');
    const owner = asset.eventId
      ? await prisma.event.findUnique({
          where: { id: asset.eventId },
          select: { officialUrl: true, sourceUrl: true },
        })
      : asset.candidateId
        ? await prisma.eventCandidate.findUnique({
            where: { id: asset.candidateId },
            select: { officialUrl: true, sourceUrl: true },
          })
        : null;
    if (!owner) throw new HttpError(404, '关联赛事或候选不存在');
    const allowedHosts = [
      new URL(owner.officialUrl || owner.sourceUrl || asset.sourcePageUrl).hostname,
    ];
    if (owner.sourceUrl) allowedHosts.push(new URL(owner.sourceUrl).hostname);
    const fetched = await fetchMediaWithRedirectReview(asset.originalUrl, allowedHosts);
    if (mediaSha256(fetched.buffer) !== asset.sha256)
      throw new HttpError(400, '原始图片内容已变化，请重新发现并提交');
    const uploaded = await eventMediaClient.upload({
      assetId: asset.id,
      buffer: fetched.buffer,
      mimeType: fetched.mimeType,
      filename: `event-cover.${fetched.mimeType.split('/')[1]}`,
    });
    const dimensions = imageDimensions(fetched.buffer, fetched.mimeType);
    const saved = await prisma.eventMediaAsset.update({
      where: { id: asset.id },
      data: {
        originalUrl: fetched.finalUrl,
        originalFileId: uploaded.originalFileId || null,
        cloudbaseFileId: uploaded.fileId,
        thumbnailFileId: uploaded.thumbnailFileId,
        mimeType: fetched.mimeType,
        width: dimensions?.width || asset.width,
        height: dimensions?.height || asset.height,
      },
    });
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'event_media.retry_upload',
      targetType: 'event_media_assets',
      targetId: saved.id,
      beforeValue: asset,
      afterValue: saved,
      note: '媒体云函数配置恢复后重试上传主图和缩略图，仍待人工审核',
    });
    res.json({ ...saved, mediaUploadStatus: 'uploaded', mediaServiceConfigured: true });
  }),
);

app.post(
  '/api/admin/media-assets/:id/review',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(mediaReviewSchema, req.body);
    const before = await prisma.eventMediaAsset.findUnique({ where: { id: req.params.id } });
    if (!before) throw new HttpError(404, '媒体不存在');
    const approved = input.action !== 'reject';
    if (approved) {
      const issues = mediaReviewIssues(before);
      if (issues.length) throw new HttpError(400, `媒体审核未通过：${issues.join('、')}`);
    }
    const updated = await prisma.$transaction(async (tx) => {
      if (input.action === 'primary' && before.eventId) {
        await tx.eventMediaAsset.updateMany({
          where: { eventId: before.eventId },
          data: { isPrimary: false },
        });
      }
      if (input.action === 'primary' && before.candidateId) {
        await tx.eventMediaAsset.updateMany({
          where: { candidateId: before.candidateId },
          data: { isPrimary: false },
        });
      }
      return tx.eventMediaAsset.update({
        where: { id: before.id },
        data: {
          reviewStatus: approved ? 'approved_for_display' : 'rejected',
          isPrimary: input.action === 'primary',
          reviewedBy: admin.id,
          reviewedAt: new Date(),
          reviewNote: input.note === undefined ? before.reviewNote : input.note || null,
        },
      });
    });
    await writeOperationLog({
      adminUserId: admin.id,
      action: `event_media.${input.action}`,
      targetType: 'event_media_assets',
      targetId: updated.id,
      beforeValue: before,
      afterValue: updated,
      note: input.note || undefined,
    });
    res.json(updated);
  }),
);

app.get(
  '/api/admin/home-editorial',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const month = String(req.query.month || new Date().toISOString().slice(0, 7));
    const plan = await prisma.homeEditorialPlan.findUnique({
      where: { month },
      include: {
        items: { include: { event: true }, orderBy: [{ section: 'asc' }, { rank: 'asc' }] },
      },
    });
    res.json({ month, items: plan?.items || [] });
  }),
);

app.put(
  '/api/admin/home-editorial',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(editorialPlanSchema, req.body);
    const ids = [...new Set(input.items.map((item) => item.eventId))];
    const events = await prisma.event.findMany({
      where: { id: { in: ids }, ...buildPublicEventWhere() },
      select: { id: true },
    });
    if (events.length !== ids.length)
      throw new HttpError(400, '首页编排只能选择已发布且在当前发现范围内的赛事');
    const rankKeys = new Set<string>();
    for (const item of input.items) {
      const key = `${item.section}:${item.rank}`;
      if (rankKeys.has(key))
        throw new HttpError(400, `首页编排排序重复：${item.section} 第 ${item.rank + 1} 位`);
      rankKeys.add(key);
    }
    const focusIds = [
      ...new Set(
        input.items.filter((item) => item.section === 'focus').map((item) => item.eventId),
      ),
    ];
    if (focusIds.length) {
      const approvedFocus = await prisma.eventMediaAsset.findMany({
        where: {
          eventId: { in: focusIds },
          reviewStatus: 'approved_for_display',
          cloudbaseFileId: { not: null },
        },
        select: { eventId: true },
        distinct: ['eventId'],
      });
      if (approvedFocus.length !== focusIds.length)
        throw new HttpError(400, '焦点赛事必须先完成 approved 图片审核和 CloudBase 上传');
    }
    const plan = await prisma.$transaction(async (tx) => {
      const saved = await tx.homeEditorialPlan.upsert({
        where: { month: input.month },
        create: { month: input.month, createdBy: admin.id, updatedBy: admin.id },
        update: { updatedBy: admin.id },
      });
      await tx.homeEditorialItem.deleteMany({ where: { planId: saved.id } });
      if (input.items.length)
        await tx.homeEditorialItem.createMany({
          data: input.items.map((item) => ({ ...item, planId: saved.id })),
        });
      return tx.homeEditorialPlan.findUnique({ where: { id: saved.id }, include: { items: true } });
    });
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'home_editorial.update',
      targetType: 'home_editorial_plans',
      targetId: plan?.id,
      afterValue: plan,
      note: `保存 ${input.month} 首页人工编排`,
    });
    res.json(plan);
  }),
);

app.get(
  '/health',
  asyncHandler(async (req, res) => {
    const health = await checkDatabase();
    if (health.ok) {
      res.json({
        ok: true,
        database: 'ok',
        databaseLatencyMs: health.latencyMs,
        release,
        timestamp: new Date().toISOString(),
      });
    } else {
      void recordApiErrorMetric({ path: req.path, category: 'health_database_error' }).catch(
        () => undefined,
      );
      res.status(503).json({
        ok: false,
        database: 'error',
        databaseLatencyMs: health.latencyMs,
        release,
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
      });
    }
  }),
);

app.post(
  '/api/auth/wechat',
  asyncHandler(async (req, res) => {
    requireUserFeature();
    const input = validateBody(wechatAuthSchema, req.body);
    const appId = process.env.WX_APPID || '';
    const appSecret = process.env.WX_APPSECRET || '';
    try {
      const openId = await exchangeWeChatCode({ code: input.code, appId, appSecret });
      const user = await registerWechatUser({
        openId,
        userKey: input.userKey,
        hashSecret: userHashSecret,
        encryptionKey: userEncryptionKey(),
      });
      await recordUserActivity({ userId: user.id, entryPage: 'app_launch' });
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      res.json({
        token: createUserToken(user.id, userTokenSecret),
        expiresAt,
        user: publicUser(user),
      });
    } catch (error) {
      if (error instanceof UserIdentityError) throw new HttpError(error.status, error.message);
      throw error;
    }
  }),
);

app.get(
  '/api/users/me',
  asyncHandler(async (req, res) => {
    requireUserFeature();
    const user = await getRequestUser(req, true);
    const [favorites, choices, feedback, reminders] = await Promise.all([
      prisma.userFavorite.count({ where: { userId: user!.id } }),
      prisma.userEventChoice.count({ where: { userId: user!.id } }),
      prisma.feedback.count({ where: { userId: user!.id } }),
      prisma.eventReminder.count({ where: { userId: user!.id, status: 'pending' } }),
    ]);
    const avatarUrls = await getAvatarTemporaryUrls([user!.avatarFileId]);
    res.json({
      user: {
        ...publicUser(user!),
        avatarUrl: user!.avatarFileId ? (avatarUrls.get(user!.avatarFileId) ?? null) : null,
      },
      summary: { favorites, choices, feedback, reminders },
    });
  }),
);

app.put(
  '/api/users/me',
  asyncHandler(async (req, res) => {
    requireUserFeature();
    const user = await getRequestUser(req, true);
    const input = validateBody(userProfileSchema, req.body);
    if (input.clearAvatar && user!.avatarFileId) await deleteAvatarFile(user!.avatarFileId);
    const updated = await prisma.user.update({
      where: { id: user!.id },
      data: {
        ...(input.nickname !== undefined ? { nickname: input.nickname || null } : {}),
        ...(input.clearAvatar ? { avatarFileId: null } : {}),
        profileUpdatedAt: new Date(),
      },
    });
    const avatarUrls = await getAvatarTemporaryUrls([updated.avatarFileId]);
    res.json({
      user: {
        ...publicUser(updated),
        avatarUrl: updated.avatarFileId ? (avatarUrls.get(updated.avatarFileId) ?? null) : null,
      },
    });
  }),
);

app.post(
  '/api/users/me/avatar-upload-grants',
  asyncHandler(async (req, res) => {
    requireUserFeature();
    const user = await getRequestUser(req, true);
    const uploadUrl = process.env.UNICLOUD_AVATAR_BASE_URL?.trim();
    if (!uploadUrl || !avatarSharedSecret) throw new HttpError(503, '头像上传服务尚未启用');
    res.status(201).json(
      await createAvatarUploadGrant({
        userId: user!.id,
        secret: avatarSharedSecret,
        uploadUrl,
      }),
    );
  }),
);

app.delete(
  '/api/users/me',
  asyncHandler(async (req, res) => {
    requireUserFeature();
    const user = await getRequestUser(req, true);
    if (user!.avatarFileId) await deleteAvatarFile(user!.avatarFileId);
    await prisma.$transaction(async (tx) => {
      await Promise.all([
        tx.feedback.updateMany({
          where: { userId: user!.id },
          data: { userId: null, userKey: null },
        }),
        tx.shareRecord.updateMany({
          where: { userId: user!.id },
          data: { userId: null, userKey: null, userKeyHash: null },
        }),
        tx.userFavorite.deleteMany({ where: { userId: user!.id } }),
        tx.userEventChoice.deleteMany({ where: { userId: user!.id } }),
        tx.userPreference.deleteMany({ where: { userId: user!.id } }),
        tx.eventReminder.deleteMany({ where: { userId: user!.id } }),
        tx.userAlias.deleteMany({ where: { userId: user!.id } }),
      ]);
      await tx.user.delete({ where: { id: user!.id } });
    });
    res.status(204).send();
  }),
);

app.post(
  '/api/activity',
  asyncHandler(async (req, res) => {
    // 本地开发或用户体系关闭时，小程序可能仍保留旧会话缓存。
    // 日活动不是主业务：静默忽略，避免控制台出现 503；登录、头像和提醒接口仍保持 503 边界。
    if (!userSystemEnabled) {
      res.status(204).send();
      return;
    }
    requireUserFeature();
    const user = await getRequestUser(req, true);
    const input = validateBody(activitySchema, req.body);
    let referralShareToken: string | undefined;
    if (input.referralShareToken) {
      const share = await prisma.shareRecord.findFirst({
        where: { shareToken: input.referralShareToken, tokenExpiresAt: { gt: new Date() } },
        select: { shareToken: true },
      });
      referralShareToken = share?.shareToken ?? undefined;
    }
    await recordUserActivity({ ...input, referralShareToken, userId: user!.id });
    res.status(201).json({ recorded: true });
  }),
);

app.get(
  '/api/users/me/reminders',
  asyncHandler(async (req, res) => {
    requireUserFeature();
    const user = await getRequestUser(req, true);
    const items = await prisma.eventReminder.findMany({
      where: { userId: user!.id, status: { in: ['pending', 'review_required'] } },
      include: { event: true },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
    });
    res.json({ items });
  }),
);

app.post(
  '/api/users/me/reminders',
  asyncHandler(async (req, res) => {
    requireUserFeature();
    if (!reminderRequestEnabled(req)) throw new HttpError(503, '赛事提醒尚未启用');
    const user = await getRequestUser(req, true);
    const input = validateBody(reminderSubscriptionSchema, req.body);
    const result = await subscribeReminders({ userId: user!.id, ...input });
    if (!result.reminders.length) throw new HttpError(400, '当前赛事暂无可订阅提醒');
    await recordUserActivity({ userId: user!.id, action: 'subscribedReminder' });
    res.status(201).json(result);
  }),
);

app.delete(
  '/api/users/me/reminders/:eventId/:type',
  asyncHandler(async (req, res) => {
    requireUserFeature();
    const user = await getRequestUser(req, true);
    const reminderType = z.enum(['signup', 'race_week']).parse(req.params.type);
    await prisma.eventReminder.updateMany({
      where: { userId: user!.id, eventId: req.params.eventId, reminderType },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
    res.status(204).send();
  }),
);

app.post(
  '/api/internal/event-media/orphan-check',
  asyncHandler(async (req, res) => {
    requireInternalEventMediaSecret(req);
    const input = z.object({ fileIds: z.array(z.string().min(1)).max(500) }).parse(req.body);
    const referenced = await prisma.eventMediaAsset.findMany({
      where: {
        OR: [
          { originalFileId: { in: input.fileIds } },
          { cloudbaseFileId: { in: input.fileIds } },
          { thumbnailFileId: { in: input.fileIds } },
        ],
      },
      select: { originalFileId: true, cloudbaseFileId: true, thumbnailFileId: true },
    });
    const used = new Set(
      referenced.flatMap(
        (item) =>
          [item.originalFileId, item.cloudbaseFileId, item.thumbnailFileId].filter(
            Boolean,
          ) as string[],
      ),
    );
    res.json({ orphanFileIds: input.fileIds.filter((fileId) => !used.has(fileId)) });
  }),
);

app.post(
  '/api/internal/event-media/complete',
  asyncHandler(async (req, res) => {
    requireInternalEventMediaSecret(req);
    const input = z
      .object({
        assetId: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        cloudbaseFileId: z.string().min(1),
        originalFileId: z.string().min(1).nullable().optional(),
        thumbnailFileId: z.string().min(1),
        width: z.number().int().positive().nullable(),
        height: z.number().int().positive().nullable(),
        processedBySharp: z.boolean().optional(),
        originalBytes: z.number().int().nonnegative().optional(),
        heroBytes: z.number().int().nonnegative().optional(),
        thumbnailBytes: z.number().int().nonnegative().optional(),
      })
      .parse(req.body);
    const asset = await prisma.eventMediaAsset.update({
      where: { id: input.assetId },
      data: {
        sha256: input.sha256,
        mimeType: input.mimeType,
        originalFileId: input.originalFileId || null,
        cloudbaseFileId: input.cloudbaseFileId,
        thumbnailFileId: input.thumbnailFileId,
        width: input.width,
        height: input.height,
        processedBySharp: input.processedBySharp ?? false,
        originalBytes: input.originalBytes,
        heroBytes: input.heroBytes,
        thumbnailBytes: input.thumbnailBytes,
      },
    });
    res.json({ id: asset.id, registered: true });
  }),
);

app.post(
  '/api/internal/avatar-upload/authorize',
  asyncHandler(async (req, res) => {
    requireInternalAvatarSecret(req);
    const input = validateBody(avatarGrantSchema, req.body);
    try {
      res.json(await consumeAvatarUploadGrant({ ...input, secret: avatarSharedSecret }));
    } catch (error) {
      if (error instanceof AvatarUploadError) throw new HttpError(error.status, error.message);
      throw error;
    }
  }),
);

app.post(
  '/api/internal/avatar-upload/complete',
  asyncHandler(async (req, res) => {
    requireInternalAvatarSecret(req);
    const input = validateBody(avatarCompleteSchema, req.body);
    try {
      const completed = await completeAvatarUpload({ ...input, secret: avatarSharedSecret });
      if (completed.previousAvatarFileId && completed.previousAvatarFileId !== input.fileId) {
        await deleteAvatarFile(completed.previousAvatarFileId);
      }
      res.json({ completed: true });
    } catch (error) {
      if (error instanceof AvatarUploadError) throw new HttpError(error.status, error.message);
      throw error;
    }
  }),
);

app.post(
  '/api/admin/auth/login',
  asyncHandler(async (req, res) => {
    const input = validateBody(loginSchema, req.body);
    const admin = await prisma.adminUser.findUnique({ where: { username: input.username } });
    if (
      !admin ||
      admin.status !== 'active' ||
      !verifyPassword(input.password, admin.passwordHash)
    ) {
      throw new HttpError(401, '用户名或密码错误');
    }
    const token = signPayload({
      adminUserId: admin.id,
      role: admin.role,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    });
    res.json({
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        displayName: admin.displayName,
        role: admin.role,
      },
    });
  }),
);

app.get(
  '/api/admin/auth/me',
  asyncHandler(async (req, res) => {
    const adminContext = getAdmin(req);
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminContext.id },
      select: { id: true, username: true, displayName: true, role: true, status: true },
    });
    if (!admin || admin.status !== 'active') throw new HttpError(401, '请先登录后台');
    res.json({ admin });
  }),
);

app.get(
  '/api/admin/dashboard',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const [
      totalEvents,
      publishedEvents,
      pendingVerifyEvents,
      pendingFeedback,
      recentLogs,
      missingSourceSummaries,
      staleSourceSummaries,
    ] = await Promise.all([
      prisma.event.count(),
      prisma.event.count({ where: { publishStatus: 'published' } }),
      prisma.event.count({ where: { infoStatus: 'pending_verify' } }),
      prisma.feedback.count({ where: { status: 'pending' } }),
      prisma.adminOperationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
      prisma.event.count({
        where: {
          ...buildPublicEventWhere(),
          sourceSummaries: { none: { status: 'published' } },
        },
      }),
      prisma.eventSourceSummary.count({
        where: { status: 'published', staleAt: { not: null }, event: buildPublicEventWhere() },
      }),
    ]);

    res.json({
      totalEvents,
      publishedEvents,
      pendingVerifyEvents,
      pendingFeedback,
      recentLogs,
      missingSourceSummaries,
      staleSourceSummaries,
    });
  }),
);

app.get(
  '/api/admin/system-health',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [database, errorRows, lastSourceRun, pendingByScope] = await Promise.all([
      checkDatabase(),
      prisma.apiErrorMetric.findMany({
        where: { bucketStart: { gte: sevenDaysAgo } },
        select: { bucketStart: true, routeGroup: true, category: true, count: true },
        orderBy: { bucketStart: 'asc' },
      }),
      prisma.eventSourceRun.findFirst({
        orderBy: { startedAt: 'desc' },
        select: {
          status: true,
          startedAt: true,
          finishedAt: true,
          source: { select: { id: true, name: true } },
        },
      }),
      prisma.feedback.groupBy({
        by: ['scope'],
        where: { status: { in: ['pending', 'handling'] } },
        _count: { _all: true },
      }),
    ]);
    res.json({
      release,
      uptimeSeconds: Math.floor(process.uptime()),
      rssMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
      database: database.ok ? 'ok' : 'error',
      databaseLatencyMs: database.latencyMs,
      errors: buildApiErrorSummary(errorRows, now),
      lastSourceRun,
      pendingFeedback: Object.fromEntries(
        pendingByScope.map((item) => [item.scope, item._count._all]),
      ),
      features: {
        userSystem: { enabled: userSystemEnabled, configured: userSystemConfigured },
        avatar: { enabled: userSystemEnabled, configured: avatarConfigured },
        reminders: { enabled: reminderFeatureEnabled, configured: remindersConfigured },
        radar: { enabled: radarFeatureEnabled, configured: true },
      },
      checkedAt: now.toISOString(),
    });
  }),
);

app.get(
  '/api/admin/data-quality/summary',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    res.json(await getDataQualitySummary());
  }),
);

app.get(
  '/api/admin/users',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin']);
    const query = validateQuery(adminUsersQuerySchema, req.query);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.UserWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) where.nickname = { contains: query.search, mode: 'insensitive' };
    if (query.openId) where.openIdHash = openIdHash(userHashSecret, query.openId);
    if (query.profile === 'complete')
      where.OR = [{ nickname: { not: null } }, { avatarFileId: { not: null } }];
    if (query.profile === 'incomplete') where.AND = [{ nickname: null }, { avatarFileId: null }];
    if (query.hasReminder === 'true') where.reminders = { some: { status: 'pending' } };
    if (query.hasReminder === 'false') where.reminders = { none: { status: 'pending' } };
    if (query.registeredFrom || query.registeredTo) {
      where.registeredAt = {
        ...(query.registeredFrom ? { gte: new Date(query.registeredFrom) } : {}),
        ...(query.registeredTo ? { lte: new Date(query.registeredTo) } : {}),
      };
    }
    if (query.activeFrom || query.activeTo) {
      where.lastActiveAt = {
        ...(query.activeFrom ? { gte: new Date(query.activeFrom) } : {}),
        ...(query.activeTo ? { lte: new Date(query.activeTo) } : {}),
      };
    }
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { registeredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            select: {
              favorites: true,
              choices: true,
              feedback: true,
              reminders: { where: { status: { in: ['pending', 'review_required'] } } },
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);
    const key = items.length ? userEncryptionKey() : null;
    const avatarUrls = await getAvatarTemporaryUrls(items.map((item) => item.avatarFileId));
    res.json({
      items: items.map((user) => {
        const openId = decryptOpenId(
          { ciphertext: user.openIdCiphertext, iv: user.openIdIv, authTag: user.openIdAuthTag },
          key!,
        );
        const { openIdCiphertext, openIdIv, openIdAuthTag, ...safeUser } = user;
        return {
          ...safeUser,
          maskedOpenId: maskOpenId(openId),
          avatarUrl: user.avatarFileId ? (avatarUrls.get(user.avatarFileId) ?? null) : null,
        };
      }),
      total,
      page,
      pageSize,
    });
  }),
);

app.get(
  '/api/admin/users/:id',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin']);
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: {
            favorites: true,
            choices: true,
            feedback: true,
            reminders: true,
            shares: true,
            activities: true,
          },
        },
        reminders: {
          where: { status: { in: ['pending', 'review_required'] } },
          include: { event: { select: { eventName: true, eventDate: true } } },
          take: 20,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!user) throw new HttpError(404, '用户不存在');
    const openId = decryptOpenId(
      { ciphertext: user.openIdCiphertext, iv: user.openIdIv, authTag: user.openIdAuthTag },
      userEncryptionKey(),
    );
    const { openIdCiphertext, openIdIv, openIdAuthTag, ...safeUser } = user;
    const avatarUrls = await getAvatarTemporaryUrls([user.avatarFileId]);
    res.json({
      ...safeUser,
      maskedOpenId: maskOpenId(openId),
      avatarUrl: user.avatarFileId ? (avatarUrls.get(user.avatarFileId) ?? null) : null,
    });
  }),
);

app.post(
  '/api/admin/users/:id/reveal-openid',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin']);
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new HttpError(404, '用户不存在');
    const openId = decryptOpenId(
      { ciphertext: user.openIdCiphertext, iv: user.openIdIv, authTag: user.openIdAuthTag },
      userEncryptionKey(),
    );
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'user.reveal_openid',
      targetType: 'users',
      targetId: user.id,
      note: '单次查看完整 OpenID',
    });
    res.json({ openId });
  }),
);

app.patch(
  '/api/admin/users/:id/status',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin']);
    const input = validateBody(adminUserStatusSchema, req.body);
    const before = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!before) throw new HttpError(404, '用户不存在');
    const updated = await prisma.$transaction(async (tx) => {
      if (input.status === 'disabled') {
        await tx.eventReminder.updateMany({
          where: { userId: before.id, status: { in: ['pending', 'review_required'] } },
          data: { status: 'cancelled', cancelledAt: new Date() },
        });
      }
      return tx.user.update({ where: { id: before.id }, data: { status: input.status } });
    });
    await writeOperationLog({
      adminUserId: admin.id,
      action: input.status === 'disabled' ? 'user.disable' : 'user.restore',
      targetType: 'users',
      targetId: before.id,
      beforeValue: { status: before.status },
      afterValue: { status: updated.status },
    });
    res.json({ id: updated.id, status: updated.status });
  }),
);

app.delete(
  '/api/admin/users/:id/profile',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin']);
    const before = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!before) throw new HttpError(404, '用户不存在');
    if (before.avatarFileId) await deleteAvatarFile(before.avatarFileId);
    await prisma.user.update({
      where: { id: before.id },
      data: { nickname: null, avatarFileId: null, profileUpdatedAt: new Date() },
    });
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'user.clear_profile',
      targetType: 'users',
      targetId: before.id,
      beforeValue: {
        hadNickname: Boolean(before.nickname),
        hadAvatar: Boolean(before.avatarFileId),
      },
      afterValue: { nickname: null, hadAvatar: false },
    });
    res.status(204).send();
  }),
);

app.get(
  '/api/admin/growth-stats',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin']);
    const days = z.coerce
      .number()
      .pipe(z.union([z.literal(7), z.literal(30)]))
      .parse(req.query.days);
    res.json(await getGrowthStats(days));
  }),
);

// ===== V0.6 匿名访客增长 =====

// 公开埋点：无需登录，不记录 IP/Cookie/指纹。失败不阻塞主业务。
app.post(
  '/api/growth/visitor-activity',
  asyncHandler(async (req, res) => {
    const input = validateBody(visitorActivitySchema, req.body);
    const now = new Date();
    const visitorKeyHashValue = userKeyHash(userHashSecret, input.userKey);

    // 归因解析：Campaign 仅 active 且有效才采纳；分享 token 校验有效性
    const resolvedCampaignId = await resolveCampaignId(input.campaign, now).catch(() => null);
    let referralShareToken = input.referralShareToken;
    if (referralShareToken) {
      const share = await prisma.shareRecord
        .findFirst({
          where: { shareToken: referralShareToken, tokenExpiresAt: { gt: now } },
          select: { shareToken: true },
        })
        .catch(() => null);
      referralShareToken = share?.shareToken ?? undefined;
    }

    // 登录用户（可选）：复用现有 token 解析
    let userId: string | undefined;
    const token = getBearerToken(req);
    if (token && userSystemEnabled) {
      try {
        userId = parseUserToken(token, userTokenSecret).userId;
      } catch {
        userId = undefined;
      }
    }

    const mapped = input.action ? visitorActionMap[input.action] : undefined;
    const actionField: VisitorAction | undefined =
      mapped && mapped !== 'viewed_event_detail' && visitorActionFields.has(mapped)
        ? mapped
        : undefined;

    // 仅 viewed_event_detail 带有效 eventId 时记录赛事浏览
    const eventId = mapped === 'viewed_event_detail' && input.eventId ? input.eventId : null;

    try {
      await recordVisitorActivity({
        visitorKeyHash: visitorKeyHashValue,
        userId,
        resolvedCampaignId,
        referralShareToken: referralShareToken ?? null,
        entryPage: input.entryPage,
        channel: resolvedCampaignId ? 'campaign' : referralShareToken ? 'share' : 'direct',
        action: actionField,
        eventId,
        now,
      });
    } catch {
      // 埋点失败不阻塞主业务（交接文档 §8.2）；吞掉错误，不影响主流程
    }
    res.status(201).json({ recorded: true });
  }),
);

// Campaign 管理（管理员）
app.get(
  '/api/admin/growth-campaigns',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator']);
    const query = validateQuery(
      z.object({
        status: z.enum(['active', 'paused', 'archived']).optional(),
        channelType: campaignChannelEnum.optional(),
      }),
      req.query,
    );
    const where: Prisma.GrowthCampaignWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.channelType) where.channelType = query.channelType as GrowthCampaignType;
    const items = await prisma.growthCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items });
  }),
);

app.post(
  '/api/admin/growth-campaigns',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator']);
    const input = validateBody(createCampaignSchema, req.body);
    const codeError = validateCampaignCode(input.code);
    if (codeError) throw new HttpError(400, codeError);
    const dateError = validateDateRange(input.startsAt, input.endsAt);
    if (dateError) throw new HttpError(400, dateError);
    const existing = await prisma.growthCampaign.findUnique({ where: { code: input.code } });
    if (existing) throw new HttpError(409, 'Campaign code 已存在');
    const created = await createCampaign(
      {
        code: input.code,
        name: input.name,
        channelType: input.channelType as GrowthCampaignType,
        partnerName: input.partnerName,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      },
      admin.id,
    );
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'create',
      targetType: 'growth_campaign',
      targetId: created.id,
      afterValue: { code: created.code, name: created.name },
    });
    res.status(201).json(created);
  }),
);

app.get(
  '/api/admin/growth-campaigns/:id',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator']);
    const item = await prisma.growthCampaign.findUnique({ where: { id: req.params.id } });
    if (!item) throw new HttpError(404, 'Campaign 不存在');
    res.json(item);
  }),
);

app.patch(
  '/api/admin/growth-campaigns/:id',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator']);
    const input = validateBody(updateCampaignSchema, req.body);
    // code 不在 updateCampaignSchema 中，因此天然不可修改
    const dateError = validateDateRange(input.startsAt ?? undefined, input.endsAt ?? undefined);
    if (dateError) throw new HttpError(400, dateError);
    const before = await prisma.growthCampaign.findUnique({ where: { id: req.params.id } });
    if (!before) throw new HttpError(404, 'Campaign 不存在');
    const updated = await updateCampaign(req.params.id, {
      name: input.name,
      channelType: input.channelType as GrowthCampaignType | undefined,
      partnerName: input.partnerName,
      startsAt: input.startsAt ?? undefined,
      endsAt: input.endsAt ?? undefined,
      status: input.status as GrowthCampaignStatus | undefined,
    });
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'update',
      targetType: 'growth_campaign',
      targetId: updated.id,
      beforeValue: { status: before.status, name: before.name },
      afterValue: { status: updated.status, name: updated.name },
    });
    res.json(updated);
  }),
);

app.get(
  '/api/admin/growth-campaigns/:id/stats',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator']);
    const days = z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .default(28)
      .parse(req.query.days ?? undefined);
    const campaign = await prisma.growthCampaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) throw new HttpError(404, 'Campaign 不存在');
    const stats = await getCampaignStats(req.params.id, days);
    // 不返回任何用户标识，仅匿名聚合
    res.json({
      campaign: {
        id: campaign.id,
        code: campaign.code,
        name: campaign.name,
        status: campaign.status,
      },
      days,
      stats,
    });
  }),
);

// 总增长漏斗（按 Campaign / 分享 / direct 切换，分子分母都返回）
app.get(
  '/api/admin/growth-funnel',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin']);
    const query = validateQuery(
      z.object({
        days: z.coerce.number().int().min(1).max(90).default(28),
        campaign: z.string().trim().max(64).optional(),
        source: z.enum(['all', 'campaign', 'share', 'direct']).optional(),
      }),
      req.query,
    );
    const now = new Date();
    const today = visitorActivityDate(now);
    const since = new Date(today.getTime() - ((query.days ?? 28) - 1) * 24 * 60 * 60 * 1000);
    const where: Prisma.GrowthVisitorDailyWhereInput = { activityDate: { gte: since } };
    if (query.campaign) {
      const c = await prisma.growthCampaign.findUnique({ where: { code: query.campaign } });
      if (c) where.campaignId = c.id;
      else where.campaignId = '__none__'; // 不存在则空集
    } else if (query.source === 'campaign') {
      where.campaignId = { not: null };
    } else if (query.source === 'share') {
      where.referralShareToken = { not: null };
    } else if (query.source === 'direct') {
      where.AND = [{ campaignId: null }, { referralShareToken: null }];
    }

    const rows = await prisma.growthVisitorDaily.findMany({
      where,
      select: {
        visitorKeyHash: true,
        viewedRadar: true,
        setPreference: true,
        addedFavorite: true,
        setChoice: true,
        subscribedReminder: true,
        copiedOfficial: true,
        startedShare: true,
        userId: true,
      },
    });
    const unique = (pred: (r: (typeof rows)[number]) => boolean) =>
      new Set(rows.filter(pred).map((r) => r.visitorKeyHash)).size;
    const visitors = new Set(rows.map((r) => r.visitorKeyHash)).size;
    const rate = (v: number, base: number) => ({
      value: v,
      base,
      rate: base ? Number(((v / base) * 100).toFixed(1)) : 0,
    });

    // 查看两场以上不同赛事
    const twoPlus = await prisma.growthVisitorEventViewDaily.groupBy({
      by: ['visitorDailyId'],
      where: { visitorDaily: where },
      _count: { eventId: true },
      having: { eventId: { _count: { gte: 2 } } },
    });
    const twoPlusVisitors = new Set(
      (
        await prisma.growthVisitorDaily.findMany({
          where: { ...where, id: { in: twoPlus.map((t) => t.visitorDailyId) } },
          select: { visitorKeyHash: true },
        })
      ).map((r) => r.visitorKeyHash),
    ).size;

    const coreAction = unique(
      (r) => r.addedFavorite || r.setChoice || r.subscribedReminder || r.copiedOfficial,
    );

    res.json({
      days: query.days,
      since: since.toISOString(),
      until: today.toISOString(),
      filter: { campaign: query.campaign ?? null, source: query.source ?? 'all' },
      funnel: {
        visitors: rate(visitors, visitors),
        radarVisitors: rate(
          unique((r) => r.viewedRadar),
          visitors,
        ),
        twoPlusEventVisitors: rate(twoPlusVisitors, visitors),
        preferenceVisitors: rate(
          unique((r) => r.setPreference),
          visitors,
        ),
        coreActionVisitors: rate(coreAction, visitors),
        shareVisitors: rate(
          unique((r) => r.startedShare),
          visitors,
        ),
      },
      // D7 留存需注册日 cohort；未成熟 cohort 显示 —（此处返回 eligible 信息由后台判断）
      d7Note: 'D7 留存沿用现有注册用户 cohort 口径，未成熟时显示 —',
    });
  }),
);

app.get(
  '/api/admin/reminder-stats',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin']);
    res.json(await getReminderStats());
  }),
);

app.get(
  '/api/admin/reminder-readiness',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    res.json(await getReminderReadiness());
  }),
);

app.get(
  '/api/admin/reminders',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const query = validateQuery(adminRemindersQuerySchema, req.query) as {
      page: number;
      pageSize: number;
      status?: string;
      reminderType?: string;
      search?: string;
    };
    res.json(await listAdminReminders(query));
  }),
);

app.get(
  '/api/admin/reminder-runs',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const query = validateQuery(paginationQuerySchema, req.query) as {
      page: number;
      pageSize: number;
    };
    res.json(await listReminderDeliveryRuns(query));
  }),
);

app.get(
  '/api/admin/workflow-stats',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const [pendingCandidates, draftEvents] = await Promise.all([
      prisma.eventCandidate.findMany({
        where: { status: { in: ['new', 'needs_review'] } },
        include: { source: true },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
      prisma.event.findMany({
        where: { publishStatus: 'draft' },
        include: { checklistItems: true },
        take: 200,
      }),
    ]);
    const duplicateGroups = buildCandidateDuplicateGroups(pendingCandidates);
    const duplicateIds = new Set(
      duplicateGroups.flatMap((group) => group.items.map((item) => item.id)),
    );
    res.json({
      duplicateGroups: duplicateGroups.length,
      readyCandidates: pendingCandidates.filter(
        (item) => candidateAcceptIssues(item).length === 0 && !duplicateIds.has(item.id),
      ).length,
      publishableDrafts: draftEvents.filter((event) => eventPublishIssues(event).length === 0)
        .length,
      missingOfficialEvidence: pendingCandidates.filter((item) => !item.officialUrl).length,
    });
  }),
);

app.post(
  '/api/admin/data-quality/cleanup',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, [
      'super_admin',
      'event_operator',
      'content_reviewer',
      'readonly',
    ]);
    const input = validateBody(dataCleanupSchema, req.body);
    if (!input.dryRun && admin.role !== 'super_admin') {
      throw new HttpError(403, '只有超级管理员可以应用数据治理');
    }
    try {
      if ('action' in input) {
        res.json(
          await archiveDuplicatePublishedEvent({
            ...input,
            dryRun: input.dryRun ?? true,
            adminUserId: admin.id,
          }),
        );
        return;
      }
      res.json(
        await runDataCleanup({ ...input, dryRun: input.dryRun ?? true, adminUserId: admin.id }),
      );
    } catch (error) {
      if (
        error instanceof DataCleanupConflictError ||
        error instanceof DuplicateEventGovernanceError
      ) {
        throw new HttpError(409, error.message);
      }
      throw error;
    }
  }),
);

app.get(
  '/api/admin/events',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const query = adminEventsQuerySchema.parse(req.query) as AdminEventsQuery;
    const { page, pageSize } = query;
    const where: Prisma.EventWhereInput = {};

    if (query.search) where.eventName = { contains: query.search, mode: 'insensitive' };
    if (query.city) where.city = query.city;
    if (query.signupStatus) where.signupStatus = query.signupStatus;
    if (query.publishStatus) where.publishStatus = query.publishStatus;
    if (query.infoStatus) where.infoStatus = query.infoStatus;
    if (query.runJudgement) where.runJudgement = query.runJudgement;
    if (query.sourceReviewPending !== undefined) {
      where.changeAlerts = query.sourceReviewPending
        ? { some: { status: 'open' } }
        : { none: { status: 'open' } };
    }

    const [items, total] = await Promise.all([
      prisma.event.findMany({
        where,
        include: {
          checklistItems: { orderBy: { sortOrder: 'asc' } },
          eventTags: true,
          changeAlerts: { where: { status: 'open' }, select: { id: true }, take: 1 },
        },
        orderBy: [{ updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.event.count({ where }),
    ]);

    res.json({
      items: items.map(({ changeAlerts, ...item }) => ({
        ...item,
        sourceReviewPending: changeAlerts.length > 0,
      })),
      total,
      page,
      pageSize,
    });
  }),
);

app.get(
  '/api/admin/event-verification/summary',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    res.json(await getEventVerificationSummary());
  }),
);

app.get(
  '/api/admin/event-verification',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const query = eventVerificationQuerySchema.parse(req.query);
    res.json(await getEventVerificationPage(query));
  }),
);

app.post(
  '/api/admin/events/bulk-verify',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(bulkVerifySchema, req.body);
    res.json(
      await runBulkVerify({
        ...input,
        dryRun: input.dryRun ?? true,
        adminUserId: admin.id,
      }),
    );
  }),
);

app.post(
  '/api/admin/events/:id/source-summaries/generate',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    try {
      const result = await createSourceSummaryDraft(req.params.id, admin.id);
      // 201 = 新建草稿；200 = 来源内容未变化，复用已有记录（仅刷新抓取时间）
      res.status(result.reused ? 200 : 201).json(result);
    } catch (error) {
      sourceSummaryHttpError(error);
    }
  }),
);

app.get(
  '/api/admin/events/:id/source-summaries',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    res.json({ items: await listSourceSummaries(req.params.id) });
  }),
);

app.put(
  '/api/admin/source-summaries/:id',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(sourceSummaryUpdateSchema, req.body);
    try {
      res.json(await updateSourceSummaryDraft(req.params.id, { ...input, adminUserId: admin.id }));
    } catch (error) {
      sourceSummaryHttpError(error);
    }
  }),
);

app.post(
  '/api/admin/source-summaries/:id/publish',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(sourceSummaryPublishSchema, req.body);
    try {
      res.json(await publishSourceSummary(req.params.id, { ...input, adminUserId: admin.id }));
    } catch (error) {
      sourceSummaryHttpError(error);
    }
  }),
);

app.post(
  '/api/admin/source-summaries/:id/reverify',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(sourceSummaryPublishSchema, req.body);
    try {
      res.json(
        await reverifyPublishedSourceSummary(req.params.id, {
          ...input,
          adminUserId: admin.id,
        }),
      );
    } catch (error) {
      sourceSummaryHttpError(error);
    }
  }),
);

app.post(
  '/api/admin/events/bulk-publish',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator']);
    const input = validateBody(bulkPublishSchema, req.body);
    if (input.dryRun) {
      const items = await previewBulkPublish(input.eventIds);
      res.json({ dryRun: true, items, published: [], failed: [] });
      return;
    }
    res.json(
      await runBulkPublish({ ...input, dryRun: input.dryRun ?? true, adminUserId: admin.id }),
    );
  }),
);

app.post(
  '/api/admin/events',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator']);
    const input = validateBody(eventSchema, req.body);
    if (input.infoStatus === 'verified') {
      throw new HttpError(400, '请先保存赛事，再通过赛事核验流程标记为已核实');
    }
    if (input.publishStatus === 'published') {
      await validatePublish({
        ...input,
        sourceUrl: input.sourceUrl as string | null,
        updatedAt: new Date(),
      });
    }
    const event = await prisma.event.create({
      data: {
        ...eventDataFromInput(input),
        checklistItems: {
          create: (input.checklistItems || []).map((item, index) => ({
            groupName: item.groupName,
            itemName: item.itemName,
            itemStatus: item.itemStatus,
            description: item.description || null,
            sortOrder: item.sortOrder ?? index + 1,
          })),
        },
        eventTags: {
          create: (input.eventTags || []).map((tag) => ({
            tagName: tag.tagName,
            tagType: tag.tagType,
          })),
        },
      },
      include: { checklistItems: true, eventTags: true },
    });

    await writeOperationLog({
      adminUserId: admin.id,
      action: 'event.create',
      targetType: 'events',
      targetId: event.id,
      afterValue: event,
      note: '新增赛事',
    });

    res.status(201).json(event);
  }),
);

app.get(
  '/api/admin/events/:id',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: { checklistItems: { orderBy: { sortOrder: 'asc' } }, eventTags: true },
    });
    if (!event) throw new HttpError(404, '赛事不存在');
    res.json(event);
  }),
);

app.put(
  '/api/admin/events/:id',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(eventSchema, req.body);
    if (input.publishStatus === 'published') {
      await validatePublish({
        id: req.params.id,
        ...input,
        sourceUrl: input.sourceUrl as string | null,
        updatedAt: new Date(),
      });
    }
    const before = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: { checklistItems: true, eventTags: true },
    });
    if (!before) throw new HttpError(404, '赛事不存在');
    if (input.infoStatus === 'verified' && before.infoStatus !== 'verified') {
      throw new HttpError(400, '请通过赛事核验流程标记为已核实');
    }
    const nextData = eventDataFromInput(input);
    const invalidatesVerification = criticalEventFieldsChanged(
      before as unknown as Record<string, unknown>,
      nextData as unknown as Record<string, unknown>,
    );
    if (invalidatesVerification) nextData.infoStatus = 'pending_verify';

    const updated = await prisma.$transaction(async (tx) => {
      await tx.eventChecklistItem.deleteMany({ where: { eventId: req.params.id } });
      await tx.eventTag.deleteMany({ where: { eventId: req.params.id } });
      const event = await tx.event.update({
        where: { id: req.params.id },
        data: {
          ...nextData,
          sourceCheckedAt: invalidatesVerification ? null : before.sourceCheckedAt,
          checklistItems: {
            create: (input.checklistItems || []).map((item, index) => ({
              groupName: item.groupName,
              itemName: item.itemName,
              itemStatus: item.itemStatus,
              description: item.description || null,
              sortOrder: item.sortOrder ?? index + 1,
            })),
          },
          eventTags: {
            create: (input.eventTags || []).map((tag) => ({
              tagName: tag.tagName,
              tagType: tag.tagType,
            })),
          },
        },
        include: { checklistItems: true, eventTags: true },
      });
      if (invalidatesVerification) {
        await tx.eventReminder.updateMany({
          where: {
            eventId: req.params.id,
            status: { in: ['pending', 'sending', 'review_required'] },
          },
          data: {
            status: 'review_required',
            lockedAt: null,
            lockToken: null,
            lastErrorCode: 'event_verification_invalidated',
          },
        });
      }
      return event;
    });

    await writeOperationLog({
      adminUserId: admin.id,
      action: 'event.update',
      targetType: 'events',
      targetId: updated.id,
      beforeValue: before,
      afterValue: updated,
      note: invalidatesVerification ? '编辑关键字段，赛事核验已失效' : '编辑赛事',
    });

    res.json(updated);
  }),
);

async function changePublishStatus(
  req: Request,
  res: Response,
  status: PublishStatus,
  action: string,
) {
  const admin = requireRole(req, ['super_admin', 'event_operator']);
  const input = validateBody(statusChangeSchema, req.body || {});
  const before = await prisma.event.findUnique({
    where: { id: req.params.id },
    include: { checklistItems: true },
  });
  if (!before) throw new HttpError(404, '赛事不存在');
  if (status === 'published') await validatePublish(before);

  const updated = await prisma.$transaction(async (tx) => {
    const event = await tx.event.update({
      where: { id: req.params.id },
      data: {
        publishStatus: status,
        publishedAt: status === 'published' ? new Date() : before.publishedAt,
        archivedAt: status === 'archived' ? new Date() : before.archivedAt,
      },
    });
    if (status !== 'published') {
      await tx.eventReminder.updateMany({
        where: {
          eventId: before.id,
          status: { in: ['pending', 'sending', 'review_required'] },
        },
        data: {
          status: 'review_required',
          lockedAt: null,
          lockToken: null,
          lastErrorCode: 'event_unpublished',
        },
      });
    }
    return event;
  });

  await writeOperationLog({
    adminUserId: admin.id,
    action,
    targetType: 'events',
    targetId: updated.id,
    beforeValue: before,
    afterValue: updated,
    note: input.note,
  });

  res.json(updated);
}

app.patch(
  '/api/admin/events/:id/publish',
  asyncHandler(async (req, res) => changePublishStatus(req, res, 'published', 'event.publish')),
);
app.patch(
  '/api/admin/events/:id/hide',
  asyncHandler(async (req, res) => changePublishStatus(req, res, 'hidden', 'event.hide')),
);
app.patch(
  '/api/admin/events/:id/offline',
  asyncHandler(async (req, res) => changePublishStatus(req, res, 'offline', 'event.offline')),
);
app.patch(
  '/api/admin/events/:id/archive',
  asyncHandler(async (req, res) => changePublishStatus(req, res, 'archived', 'event.archive')),
);

app.get(
  '/api/admin/feedback',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const query = validateQuery(adminFeedbackQuerySchema, req.query) as AdminFeedbackQuery;
    const { page, pageSize, status } = query;
    const where: Prisma.FeedbackWhereInput = {};
    if (status) where.status = status;
    if (query.scope) where.scope = query.scope;
    if (query.feedbackType) where.feedbackType = query.feedbackType;
    if (query.contextPage) where.contextPage = query.contextPage;
    const clauses: Prisma.FeedbackWhereInput[] = [];
    if (query.eventScope === 'public') {
      clauses.push({ scope: 'event_correction' });
      clauses.push({ event: { is: buildPublicEventWhere() } });
    } else if (query.eventScope === 'unpublished') {
      clauses.push({ scope: 'event_correction' });
      clauses.push({
        OR: [{ eventId: null }, { event: { isNot: buildPublicEventWhere() } }],
      });
    }
    if (query.search) {
      clauses.push({
        OR: [
          { content: { contains: query.search, mode: 'insensitive' } },
          { event: { is: { eventName: { contains: query.search, mode: 'insensitive' } } } },
        ],
      });
    }
    if (clauses.length) where.AND = clauses;

    const [items, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        include: {
          event: {
            select: {
              id: true,
              eventName: true,
              city: true,
              eventDate: true,
              publishStatus: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.feedback.count({ where }),
    ]);
    res.json({
      items: items.map((item) => ({ ...item, ...feedbackDisposition(item) })),
      total,
      page,
      pageSize,
    });
  }),
);

app.get(
  '/api/admin/feedback/summary',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const now = new Date();
    const day = chinaDay(now);
    const sevenDaysAgo = new Date(day.getTime() - 6 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(day.getTime() - 29 * 24 * 60 * 60 * 1000);
    const [records, blocked7d, blocked30d, submissions7d, submissions30d] = await Promise.all([
      prisma.feedback.findMany({
        where: { status: { in: ['pending', 'handling'] } },
        include: {
          event: {
            select: {
              id: true,
              eventName: true,
              city: true,
              eventDate: true,
              publishStatus: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 2001,
      }),
      prisma.feedbackAbuseMetric.aggregate({
        where: { day: { gte: sevenDaysAgo } },
        _sum: { count: true },
      }),
      prisma.feedbackAbuseMetric.aggregate({
        where: { day: { gte: thirtyDaysAgo } },
        _sum: { count: true },
      }),
      prisma.feedback.groupBy({
        by: ['scope'],
        where: { createdAt: { gte: sevenDaysAgo } },
        _count: { _all: true },
      }),
      prisma.feedback.groupBy({
        by: ['scope'],
        where: { createdAt: { gte: thirtyDaysAgo } },
        _count: { _all: true },
      }),
    ]);
    const truncated = records.length > 2000;
    const items = records.slice(0, 2000);
    res.json({
      ...buildFeedbackSummary(items, blocked7d._sum.count || 0, blocked30d._sum.count || 0, now),
      submissions7d: Object.fromEntries(
        submissions7d.map((item) => [item.scope, item._count._all]),
      ),
      submissions30d: Object.fromEntries(
        submissions30d.map((item) => [item.scope, item._count._all]),
      ),
      truncated,
    });
  }),
);

app.post(
  '/api/admin/feedback/bulk-handle',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(feedbackBulkHandleSchema, req.body);
    res.json(
      await runFeedbackBulk({ ...input, dryRun: input.dryRun ?? true, adminUserId: admin.id }),
    );
  }),
);

app.get(
  '/api/admin/feedback/duplicates',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const { hours = 24 } = validateQuery(adminFeedbackDuplicateQuerySchema, req.query);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const items = await prisma.feedback.findMany({
      where: { status: { in: ['pending', 'handling'] }, createdAt: { gte: since } },
      include: { event: { select: { id: true, eventName: true, city: true } } },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });
    const buckets = new Map<string, typeof items>();
    for (const item of items) {
      const key = feedbackDuplicateKey(item);
      buckets.set(key, [...(buckets.get(key) || []), item]);
    }

    const groups = Array.from(buckets.values()).flatMap((bucket) => {
      const clusters: Array<typeof bucket> = [];
      for (const item of bucket) {
        const current = clusters.at(-1);
        if (
          !current ||
          item.createdAt.getTime() - current[0].createdAt.getTime() > 24 * 60 * 60 * 1000
        ) {
          clusters.push([item]);
        } else {
          current.push(item);
        }
      }
      return clusters
        .filter((cluster) => cluster.length > 1)
        .map((cluster) => ({
          primary: cluster[0],
          duplicates: cluster.slice(1),
          count: cluster.length,
        }));
    });
    res.json({ groups });
  }),
);

app.post(
  '/api/admin/feedback/duplicates/reject',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(feedbackDuplicateResolveSchema, req.body);
    const duplicateIds = [...new Set(input.duplicateIds)].filter((id) => id !== input.primaryId);
    if (duplicateIds.length === 0) throw new HttpError(400, '请至少选择一条重复反馈');
    const records = await prisma.feedback.findMany({
      where: { id: { in: [input.primaryId, ...duplicateIds] } },
      orderBy: { createdAt: 'asc' },
    });
    const primary = records.find((item) => item.id === input.primaryId);
    const duplicates = records.filter((item) => duplicateIds.includes(item.id));
    if (!primary || duplicates.length !== duplicateIds.length)
      throw new HttpError(404, '反馈不存在');
    if (duplicates.some((item) => !['pending', 'handling'].includes(item.status))) {
      throw new HttpError(409, '只能批量驳回待处理或处理中反馈');
    }
    const key = feedbackDuplicateKey(primary);
    const withinWindow = duplicates.every(
      (item) =>
        feedbackDuplicateKey(item) === key &&
        Math.abs(item.createdAt.getTime() - primary.createdAt.getTime()) <= 24 * 60 * 60 * 1000,
    );
    if (!withinWindow) throw new HttpError(400, '所选反馈不属于同一重复组');

    const result = await prisma.feedback.updateMany({
      where: { id: { in: duplicateIds }, status: { in: ['pending', 'handling'] } },
      data: {
        status: 'rejected',
        adminNote: '系统判定：重复提交',
        handledBy: admin.id,
        handledAt: new Date(),
      },
    });
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'feedback.deduplicate',
      targetType: 'feedback',
      targetId: primary.id,
      beforeValue: duplicates,
      afterValue: { rejectedIds: duplicateIds, count: result.count },
      note: '系统判定：重复提交',
    });
    res.json({ primaryId: primary.id, rejectedCount: result.count });
  }),
);

app.get(
  '/api/admin/feedback/:id',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const feedback = await prisma.feedback.findUnique({
      where: { id: req.params.id },
      include: { event: true },
    });
    if (!feedback) throw new HttpError(404, '反馈不存在');
    res.json(feedback);
  }),
);

app.patch(
  '/api/admin/feedback/:id/handle',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(feedbackHandleSchema, req.body);
    const before = await prisma.feedback.findUnique({ where: { id: req.params.id } });
    if (!before) throw new HttpError(404, '反馈不存在');
    const updated = await prisma.feedback.update({
      where: { id: req.params.id },
      data: {
        status: input.status as FeedbackStatus,
        adminNote: input.adminNote || null,
        handledBy: admin.id,
        handledAt: input.status === 'handling' ? null : new Date(),
      },
    });
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'feedback.handle',
      targetType: 'feedback',
      targetId: updated.id,
      beforeValue: before,
      afterValue: updated,
      note: input.adminNote || undefined,
    });
    res.json(updated);
  }),
);

app.get(
  '/api/admin/operation-logs',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const query = validateQuery(operationLogsQuerySchema, req.query) as OperationLogsQuery;
    const { page, pageSize } = query;
    const where: Prisma.AdminOperationLogWhereInput = {};
    if (query.targetType) where.targetType = query.targetType;
    if (query.targetId) where.targetId = query.targetId;
    if (query.action) where.action = query.action;
    const [items, total] = await Promise.all([
      prisma.adminOperationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.adminOperationLog.count({ where }),
    ]);
    res.json({ items, total, page, pageSize });
  }),
);

app.get(
  '/api/admin/admin-users',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin']);
    const items = await prisma.adminUser.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ items });
  }),
);

app.post(
  '/api/admin/admin-users',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin']);
    const input = validateBody(adminUserCreateSchema, req.body);
    const existing = await prisma.adminUser.findUnique({ where: { username: input.username } });
    if (existing) throw new HttpError(400, '用户名已存在');

    const created = await prisma.adminUser.create({
      data: {
        username: input.username,
        displayName: input.displayName,
        role: input.role as AdminRole,
        passwordHash: hashPassword(input.password),
        status: 'active',
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await writeOperationLog({
      adminUserId: admin.id,
      action: 'admin_user.create',
      targetType: 'admin_users',
      targetId: created.id,
      afterValue: created,
      note: `新增管理员 ${created.username}`,
    });

    res.status(201).json(created);
  }),
);

app.patch(
  '/api/admin/admin-users/:id',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin']);
    const input = validateBody(adminUserUpdateSchema, req.body);
    const before = await prisma.adminUser.findUnique({ where: { id: req.params.id } });
    if (!before) throw new HttpError(404, '管理员不存在');

    const data: Prisma.AdminUserUncheckedUpdateInput = {};
    if (input.role) data.role = input.role as AdminRole;
    if (input.status) data.status = input.status;
    if (input.displayName) data.displayName = input.displayName;
    if (input.password) data.passwordHash = hashPassword(input.password);

    const updated = await prisma.adminUser.update({
      where: { id: req.params.id },
      data,
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await writeOperationLog({
      adminUserId: admin.id,
      action: 'admin_user.update',
      targetType: 'admin_users',
      targetId: updated.id,
      beforeValue: { ...before, passwordHash: '[redacted]' },
      afterValue: updated,
      note: `更新管理员 ${updated.username}`,
    });

    res.json(updated);
  }),
);

app.get(
  '/api/admin/event-change-alerts/summary',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    res.json(await getEventChangeAlertSummary());
  }),
);

app.get(
  '/api/admin/event-change-alerts',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const query = eventChangeAlertQuerySchema.parse(req.query);
    res.json(await listEventChangeAlerts(query));
  }),
);

app.post(
  '/api/admin/event-change-alerts/:id/resolve',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = eventChangeResolveSchema.parse(req.body);
    if (
      input.action !== 'dismiss' &&
      admin.role !== 'super_admin' &&
      admin.role !== 'event_operator'
    ) {
      throw new HttpError(403, '当前角色只能忽略变更告警');
    }
    try {
      if (input.dryRun) {
        res.json({
          dryRun: true,
          preview: await previewEventChangeResolution(req.params.id, input),
        });
        return;
      }
      res.json({
        dryRun: false,
        result: await resolveEventChangeAlert(req.params.id, {
          ...input,
          expected: input.expected!,
          adminUserId: admin.id,
        }),
      });
    } catch (error) {
      if (error instanceof EventChangeNotFoundError) throw new HttpError(404, error.message);
      if (error instanceof EventChangeConflictError) throw new HttpError(409, error.message);
      if (error instanceof EventChangeResolutionError) throw new HttpError(400, error.message);
      throw error;
    }
  }),
);

app.get(
  '/api/admin/event-sources',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const items = await prisma.eventSource.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ items });
  }),
);

app.post(
  '/api/admin/event-sources',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator']);
    const input = eventSourceSchema.parse(req.body);
    const created = await prisma.eventSource.create({
      data: {
        ...input,
        nextRunAt: nextRunAtForSourceConfig(input, null, new Date()),
      },
    });
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'event_source.create',
      targetType: 'event_sources',
      targetId: created.id,
      afterValue: created,
      note: '新增 AI 赛事源',
    });
    res.status(201).json(created);
  }),
);

app.put(
  '/api/admin/event-sources/:id',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator']);
    const input = eventSourceSchema.parse(req.body);
    const before = await prisma.eventSource.findUnique({ where: { id: req.params.id } });
    if (!before) throw new HttpError(404, '赛事源不存在');
    const updated = await prisma.eventSource.update({
      where: { id: before.id },
      data: {
        ...input,
        nextRunAt: nextRunAtForSourceConfig(input, before.nextRunAt, new Date()),
      },
    });
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'event_source.update',
      targetType: 'event_sources',
      targetId: updated.id,
      beforeValue: before,
      afterValue: updated,
      note: '更新 AI 赛事源',
    });
    res.json(updated);
  }),
);

app.post(
  '/api/admin/event-sources/:id/run',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator']);
    try {
      const summary = await runEventSource(req.params.id, { trigger: 'manual' });
      await writeOperationLog({
        adminUserId: admin.id,
        action: 'event_source.run',
        targetType: 'event_sources',
        targetId: req.params.id,
        afterValue: summary,
        note: `手动抓取赛事源：新增 ${summary.created}，更新 ${summary.updated}，跳过已审核 ${summary.skippedReviewed}，新变更 ${summary.changeAlertsCreated}，已存在变更 ${summary.changeAlertsExisting}，过滤过期 ${summary.skippedExpired}，过滤区域外 ${summary.skippedOutsideRegion}`,
      });
      res.status(201).json(summary);
    } catch (error) {
      await writeOperationLog({
        adminUserId: admin.id,
        action: 'event_source.run_failed',
        targetType: 'event_sources',
        targetId: req.params.id,
        note: error instanceof Error ? error.message.slice(0, 200) : 'AI 赛事源抽取失败',
      }).catch(() => undefined);
      if (error instanceof AiIngestError) {
        throw new HttpError(error.status, error.message);
      }
      throw error;
    }
  }),
);

app.get(
  '/api/admin/event-source-runs',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const query = eventSourceRunQuerySchema.parse(req.query);
    const where: Prisma.EventSourceRunWhereInput = {};
    if (query.sourceId) where.sourceId = query.sourceId;
    if (query.status) where.status = query.status;
    const [items, total] = await Promise.all([
      prisma.eventSourceRun.findMany({
        where,
        include: { source: { select: { id: true, name: true, sourceType: true } } },
        orderBy: { startedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.eventSourceRun.count({ where }),
    ]);
    res.json({ items, total, page: query.page, pageSize: query.pageSize });
  }),
);

app.get(
  '/api/admin/event-candidate-stats',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const sourceId = typeof req.query.sourceId === 'string' ? req.query.sourceId.trim() : '';
    const sourceWhere: Prisma.EventCandidateWhereInput = sourceId ? { sourceId } : {};
    const pendingWhere: Prisma.EventCandidateWhereInput = {
      ...sourceWhere,
      status: { in: ['new', 'needs_review'] },
    };
    const [pending, urgent, missingOfficialUrl, duplicates] = await Promise.all([
      prisma.eventCandidate.count({ where: pendingWhere }),
      prisma.eventCandidate.count({ where: { ...pendingWhere, priorityScore: 100 } }),
      prisma.eventCandidate.count({
        where: { ...pendingWhere, reviewIssues: { has: 'missing_official_url' } },
      }),
      prisma.eventCandidate.count({
        where: { ...pendingWhere, reviewIssues: { has: 'duplicate_event' } },
      }),
    ]);
    res.json({ pending, urgent, missingOfficialUrl, duplicates });
  }),
);

app.get(
  '/api/admin/event-candidate-duplicate-groups',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const groups = await getCandidateDuplicateGroups();
    res.json({ groups, total: groups.length });
  }),
);

app.post(
  '/api/admin/event-candidates/merge',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(candidateMergeSchema, req.body);
    try {
      res.json(await mergeEventCandidates({ ...input, adminUserId: admin.id }));
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : '候选合并失败');
    }
  }),
);

app.post(
  '/api/admin/event-candidates/bulk-accept',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(bulkAcceptSchema, req.body);
    if (input.dryRun) {
      const items = await previewBulkAccept(input.candidateIds);
      res.json({ dryRun: true, items, accepted: [], failed: [] });
      return;
    }
    res.json(
      await runBulkAccept({ ...input, dryRun: input.dryRun ?? true, adminUserId: admin.id }),
    );
  }),
);

app.get(
  '/api/admin/event-candidates',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const query = eventCandidateQuerySchema.parse(req.query);
    const where = buildCandidateWhere(query);
    if (query.readiness) {
      const [pendingItems, duplicatePool] = await Promise.all([
        prisma.eventCandidate.findMany({
          where: { ...where, status: { in: ['new', 'needs_review'] } },
          include: { source: true },
          orderBy: buildCandidateOrderBy(query.sort),
          take: 200,
        }),
        prisma.eventCandidate.findMany({
          where: { status: { in: ['new', 'needs_review'] }, eventDate: { not: null } },
          include: { source: true },
          orderBy: { createdAt: 'asc' },
          take: 200,
        }),
      ]);
      const duplicateIds = new Set(
        buildCandidateDuplicateGroups(duplicatePool).flatMap((group) =>
          group.items.map((item) => item.id),
        ),
      );
      const filtered = pendingItems.filter((item) => {
        const ready = candidateAcceptIssues(item).length === 0 && !duplicateIds.has(item.id);
        return query.readiness === 'ready' ? ready : !ready;
      });
      const offset = (query.page - 1) * query.pageSize;
      res.json({
        items: filtered.slice(offset, offset + query.pageSize),
        total: filtered.length,
        page: query.page,
        pageSize: query.pageSize,
      });
      return;
    }
    const [items, total] = await Promise.all([
      prisma.eventCandidate.findMany({
        where,
        include: { source: true },
        orderBy: buildCandidateOrderBy(query.sort),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.eventCandidate.count({ where }),
    ]);
    res.json({ items, total, page: query.page, pageSize: query.pageSize });
  }),
);

app.put(
  '/api/admin/event-candidates/:id',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(candidatePatchSchema, req.body);
    const before = await prisma.eventCandidate.findUnique({ where: { id: req.params.id } });
    if (!before) throw new HttpError(404, '候选赛事不存在');
    if (!['new', 'needs_review'].includes(before.status)) {
      throw new HttpError(400, '仅待复核候选可以编辑');
    }
    const classification = classifyCandidate(
      input.extractedData,
      new Date(),
      before.duplicateEventId,
    );

    const updated = await prisma.eventCandidate.update({
      where: { id: before.id },
      data: {
        eventName: input.extractedData.eventName,
        city: input.extractedData.city,
        provinceCode: input.extractedData.provinceCode,
        cityCode: input.extractedData.cityCode,
        eventDate: input.extractedData.eventDate
          ? new Date(`${input.extractedData.eventDate}T00:00:00.000Z`)
          : null,
        sourceUrl: input.extractedData.sourceUrl,
        officialUrl: input.extractedData.officialUrl,
        extractedData: input.extractedData as Prisma.InputJsonObject,
        evidence: input.extractedData.evidence as Prisma.InputJsonArray,
        confidence: input.extractedData.confidence as Prisma.InputJsonObject,
        priorityScore: classification.priorityScore,
        reviewIssues: classification.reviewIssues,
        status: 'needs_review',
      },
    });
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'event_candidate.update',
      targetType: 'event_candidates',
      targetId: updated.id,
      beforeValue: before,
      afterValue: updated,
      note: '人工补充 AI 候选赛事字段',
    });
    res.json(updated);
  }),
);

app.post(
  '/api/admin/event-candidates/:id/review',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(candidateReviewSchema, req.body);
    const candidate = await prisma.eventCandidate.findUnique({ where: { id: req.params.id } });
    if (!candidate) throw new HttpError(404, '候选赛事不存在');

    if (input.action === 'reject') {
      const rejected = await prisma.eventCandidate.update({
        where: { id: candidate.id },
        data: {
          status: 'rejected',
          reviewedBy: admin.id,
          reviewedAt: new Date(),
          rejectReason: input.rejectReason || null,
        },
      });
      await writeOperationLog({
        adminUserId: admin.id,
        action: 'event_candidate.reject',
        targetType: 'event_candidates',
        targetId: rejected.id,
        beforeValue: candidate,
        afterValue: rejected,
        note: input.rejectReason || '驳回 AI 候选赛事',
      });
      res.json(rejected);
      return;
    }

    const preview = await previewBulkAccept([candidate.id]);
    const result = await runBulkAccept({
      candidateIds: [candidate.id],
      dryRun: false,
      expected: preview.flatMap((item) =>
        item.updatedAt ? [{ id: item.id, updatedAt: item.updatedAt }] : [],
      ),
      adminUserId: admin.id,
    });
    if (!result.accepted.length) {
      throw new HttpError(400, result.failed[0]?.issues.join('、') || '候选赛事无法采纳');
    }
    const accepted = result.accepted[0];
    const event = await prisma.event.findUnique({ where: { id: accepted.eventId } });
    const updatedCandidate = await prisma.eventCandidate.findUnique({
      where: { id: candidate.id },
    });
    res.status(201).json({ event, candidate: updatedCandidate });
  }),
);

app.get(
  '/api/admin/system-configs',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const items = await prisma.systemConfig.findMany({ orderBy: { configKey: 'asc' } });
    res.json({ items });
  }),
);

app.put(
  '/api/admin/system-configs/:key',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin']);
    const input = validateBody(systemConfigSchema, req.body);
    const before = await prisma.systemConfig.findUnique({ where: { configKey: req.params.key } });
    const updated = await prisma.systemConfig.upsert({
      where: { configKey: req.params.key },
      create: {
        configKey: req.params.key,
        configValue: input.configValue as Prisma.InputJsonValue,
        description: input.description,
      },
      update: {
        configValue: input.configValue as Prisma.InputJsonValue,
        description: input.description,
      },
    });
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'config.update',
      targetType: 'config',
      targetId: updated.configKey,
      beforeValue: before,
      afterValue: updated,
    });
    res.json(updated);
  }),
);

app.get(
  '/api/admin/share-settings',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    res.json({
      settings: await getPublicShareSettings(),
      allowedHosts: shareImageAllowedHosts,
    });
  }),
);

app.put(
  '/api/admin/share-settings',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin']);
    const input = validateBody(shareSettingsSchema, req.body);
    const before = await prisma.systemConfig.findUnique({ where: { configKey: 'share_settings' } });
    const updated = await prisma.systemConfig.upsert({
      where: { configKey: 'share_settings' },
      create: {
        configKey: 'share_settings',
        configValue: input as Prisma.InputJsonValue,
        description: '小程序原生分享场景标题与图片',
      },
      update: { configValue: input as Prisma.InputJsonValue },
    });
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'share_settings.update',
      targetType: 'share_settings',
      targetId: updated.id,
      beforeValue: before,
      afterValue: updated,
      note: '更新全局分享设置',
    });
    res.json({
      settings: mergeShareSettings(updated.configValue, updated.updatedAt.toISOString()),
    });
  }),
);

app.get(
  '/api/admin/event-share-overrides',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const query = validateQuery(
      paginationQuerySchema.extend({ search: queryStringSchema }),
      req.query,
    );
    const search = typeof query.search === 'string' ? query.search : undefined;
    const where: Prisma.EventWhereInput = search
      ? { eventName: { contains: search, mode: 'insensitive' } }
      : {};
    const [items, total] = await Promise.all([
      prisma.event.findMany({
        where,
        select: {
          id: true,
          eventName: true,
          city: true,
          eventDate: true,
          eventStartAt: true,
          publishStatus: true,
          shareOverride: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 20),
        take: query.pageSize ?? 20,
      }),
      prisma.event.count({ where }),
    ]);
    res.json({ items, total, page: query.page, pageSize: query.pageSize });
  }),
);

app.put(
  '/api/admin/events/:id/share-override',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(eventShareOverrideSchema, req.body);
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!event) throw new HttpError(404, '赛事不存在');
    const before = await prisma.eventShareOverride.findUnique({ where: { eventId: event.id } });
    const updated = await prisma.eventShareOverride.upsert({
      where: { eventId: event.id },
      create: { eventId: event.id, titleTemplate: input.titleTemplate, imageUrl: input.imageUrl },
      update: { titleTemplate: input.titleTemplate, imageUrl: input.imageUrl },
    });
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'event_share_override.update',
      targetType: 'event_share_override',
      targetId: updated.id,
      beforeValue: before,
      afterValue: updated,
      note: '更新赛事分享覆盖',
    });
    res.json(updated);
  }),
);

app.delete(
  '/api/admin/events/:id/share-override',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const before = await prisma.eventShareOverride.findUnique({
      where: { eventId: req.params.id },
    });
    if (!before) {
      res.status(204).send();
      return;
    }
    await prisma.eventShareOverride.delete({ where: { eventId: req.params.id } });
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'event_share_override.delete',
      targetType: 'event_share_override',
      targetId: before.id,
      beforeValue: before,
      note: '清除赛事分享覆盖',
    });
    res.status(204).send();
  }),
);

app.get(
  '/api/admin/release-notes',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const items = await prisma.releaseNote.findMany({
      orderBy: [{ releasedAt: 'desc' }, { id: 'desc' }],
    });
    res.json({ items });
  }),
);

app.post(
  '/api/admin/release-notes',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(releaseNoteInputSchema, req.body);
    const data = releaseNotePayload(input);
    if (await prisma.releaseNote.findUnique({ where: { version: data.version } })) {
      throw new HttpError(409, '版本号已存在');
    }
    const created = await prisma.releaseNote.create({ data });
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'release_note.create',
      targetType: 'release_note',
      targetId: created.id,
      afterValue: created,
      note: `创建更新日志 ${created.version}`,
    });
    res.status(201).json(created);
  }),
);

app.put(
  '/api/admin/release-notes/:id',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
    const input = validateBody(releaseNoteInputSchema, req.body);
    const before = await prisma.releaseNote.findUnique({ where: { id: req.params.id } });
    if (!before) throw new HttpError(404, '更新日志不存在');
    if (before.status === 'published') throw new HttpError(409, '已发布日志请先下线再编辑');
    const data = releaseNotePayload(input);
    const duplicate = await prisma.releaseNote.findFirst({
      where: { version: data.version, id: { not: before.id } },
    });
    if (duplicate) throw new HttpError(409, '版本号已存在');
    const updated = await prisma.releaseNote.update({ where: { id: before.id }, data });
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'release_note.update',
      targetType: 'release_note',
      targetId: updated.id,
      beforeValue: before,
      afterValue: updated,
      note: `编辑更新日志 ${updated.version}`,
    });
    res.json(updated);
  }),
);

app.patch(
  '/api/admin/release-notes/:id/status',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator']);
    const input = validateBody(z.object({ action: z.enum(['publish', 'offline']) }), req.body);
    const before = await prisma.releaseNote.findUnique({ where: { id: req.params.id } });
    if (!before) throw new HttpError(404, '更新日志不存在');
    if (input.action === 'offline' && before.status !== 'published') {
      throw new HttpError(409, '只有已发布日志可下线');
    }
    const updated = await prisma.releaseNote.update({
      where: { id: before.id },
      data:
        input.action === 'publish'
          ? { status: 'published', publishedAt: before.publishedAt || new Date() }
          : { status: 'offline' },
    });
    await writeOperationLog({
      adminUserId: admin.id,
      action: `release_note.${input.action}`,
      targetType: 'release_note',
      targetId: updated.id,
      beforeValue: before,
      afterValue: updated,
      note: `${input.action === 'publish' ? '发布' : '下线'}更新日志 ${updated.version}`,
    });
    res.json(updated);
  }),
);

app.get(
  '/api/admin/share-records/stats',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [total, pageShares, timelineShares, imageGenerates, topEventsRaw, dailyRaw] =
      await Promise.all([
        prisma.shareRecord.count(),
        prisma.shareRecord.count({ where: { shareType: 'page_share' } }),
        prisma.shareRecord.count({ where: { shareType: 'timeline_share' } }),
        prisma.shareRecord.count({ where: { shareType: 'image_generate' } }),
        prisma.shareRecord.groupBy({
          by: ['eventId'],
          _count: { _all: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10,
        }),
        prisma.shareRecord.findMany({
          where: { createdAt: { gte: since } },
          select: { shareType: true, createdAt: true },
        }),
      ]);

    const eventIds = topEventsRaw.map((item) => item.eventId).filter(Boolean) as string[];
    const events = await prisma.event.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, eventName: true, city: true, eventDate: true },
    });
    const eventMap = new Map(events.map((event) => [event.id, event]));
    const topEvents = topEventsRaw.map((item) => ({
      event: item.eventId ? eventMap.get(item.eventId) : null,
      count: item._count._all,
    }));

    // 按天聚合趋势
    const dailyMap = new Map<
      string,
      { pageShare: number; timelineShare: number; imageGenerate: number }
    >();
    for (const record of dailyRaw) {
      const day = record.createdAt.toISOString().slice(0, 10);
      const entry = dailyMap.get(day) || { pageShare: 0, timelineShare: 0, imageGenerate: 0 };
      if (record.shareType === 'page_share') entry.pageShare += 1;
      else if (record.shareType === 'timeline_share') entry.timelineShare += 1;
      else if (record.shareType === 'image_generate') entry.imageGenerate += 1;
      dailyMap.set(day, entry);
    }
    const daily = Array.from(dailyMap.entries())
      .map(([day, counts]) => ({
        day,
        ...counts,
        total: counts.pageShare + counts.timelineShare + counts.imageGenerate,
      }))
      .sort((a, b) => a.day.localeCompare(b.day));

    res.json({ total, pageShares, timelineShares, imageGenerates, topEvents, daily });
  }),
);

app.get(
  '/api/admin/interaction-stats',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const days = Number(req.query.days) === 7 ? 7 : 30;
    res.json(await getInteractionStats(days));
  }),
);

app.get(
  '/api/admin/event-choice-stats',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const query = validateQuery(eventChoiceStatsQuerySchema, req.query);
    res.json(
      await getAdminEventChoiceStats({
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        search: typeof query.search === 'string' ? query.search : undefined,
        publishStatus: query.publishStatus,
        sort: query.sort ?? 'total_desc',
        eventDateFrom: query.eventDateFrom
          ? new Date(`${query.eventDateFrom}T00:00:00.000Z`)
          : undefined,
        eventDateTo: query.eventDateTo ? new Date(`${query.eventDateTo}T00:00:00.000Z`) : undefined,
      }),
    );
  }),
);

app.get(
  '/api/share-settings',
  asyncHandler(async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    res.json({ settings: await getPublicShareSettings() });
  }),
);

app.get(
  '/api/release-notes/latest',
  asyncHandler(async (_req, res) => {
    const item = await prisma.releaseNote.findFirst({
      where: { status: 'published' },
      select: { id: true, version: true, releasedAt: true, publishedAt: true },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ item });
  }),
);

app.get(
  '/api/release-notes',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const cursor = decodeReleaseCursor(req.query.cursor);
    const items = await prisma.releaseNote.findMany({
      where: {
        status: 'published',
        ...(cursor
          ? {
              OR: [
                { releasedAt: { lt: cursor.releasedAt } },
                { releasedAt: cursor.releasedAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ releasedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = items.length > limit;
    const visible = hasMore ? items.slice(0, limit) : items;
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({
      items: visible,
      nextCursor:
        hasMore && visible.length ? encodeReleaseCursor(visible[visible.length - 1]) : null,
    });
  }),
);

// V0.6 公开雷达接口（无需登录）。开关关闭时返回稳定空结构。
const radarQuerySchema = z.object({
  cities: z.string().trim().max(200).optional(),
  distances: z.string().trim().max(100).optional(),
  focusTags: z.string().trim().max(200).optional(),
  windowDays: z.coerce.number().int().optional(),
  campaign: z.string().trim().max(64).optional(),
  limitPerGroup: z.coerce.number().int().optional(),
});

app.get(
  '/api/radar',
  asyncHandler(async (req, res) => {
    const query = validateQuery(radarQuerySchema, req.query);
    // 开关关闭：稳定空结构，首页可回退
    if (!radarFeatureEnabled) {
      res.json(radarDisabledResponse());
      return;
    }
    const { response, campaignId } = await queryRadar({
      cities: query.cities,
      distances: query.distances,
      focusTags: query.focusTags,
      windowDays: query.windowDays,
      campaign: query.campaign,
      limitPerGroup: query.limitPerGroup,
    });
    res.json(response);
    // 归因记录（非阻塞，失败不影响响应）
    void campaignId;
  }),
);

app.get(
  '/api/regions',
  asyncHandler(async (_req, res) => {
    res.json({
      nationwideEnabled: isNationwideDiscoveryEnabled(),
      provinces: getSupportedProvinces(),
      provinceCodes: supportedProvinceCodes,
    });
  }),
);

app.get(
  '/api/discovery/home',
  asyncHandler(async (req, res) => {
    const month = String(req.query.month || new Date().toISOString().slice(0, 7));
    const { start, end } = homeMonthRange(month);
    const userKey = typeof req.query.userKey === 'string' ? req.query.userKey : undefined;
    const preference = userKey
      ? await prisma.userPreference.findUnique({ where: { userKey } }).catch(() => null)
      : null;
    const where = {
      ...buildPublicEventWhere(),
      eventDate: { gte: start, lt: end },
    } satisfies Prisma.EventWhereInput;
    const events = await prisma.event.findMany({
      where,
      include: {
        mediaAssets: {
          where: { reviewStatus: 'approved_for_display' },
          orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
          take: 3,
        },
      },
      orderBy: [{ eventDate: 'asc' }, { updatedAt: 'desc' }],
      take: 100,
    });
    const plan = await prisma.homeEditorialPlan.findUnique({
      where: { month },
      include: {
        items: {
          include: {
            event: {
              include: {
                mediaAssets: { where: { reviewStatus: 'approved_for_display' }, take: 3 },
              },
            },
          },
          orderBy: [{ section: 'asc' }, { rank: 'asc' }],
        },
      },
    });
    const byId = new Map(events.map((event) => [event.id, event]));
    const used = new Set<string>();
    const manual = (section: string) =>
      (plan?.items || [])
        .filter((item) => item.section === section && byId.has(item.eventId))
        .sort((a, b) => a.rank - b.rank)
        .map((item) => byId.get(item.eventId)!)
        .filter((event) => {
          if (used.has(event.id)) return false;
          used.add(event.id);
          return true;
        });
    const automatic = [...events].sort((a, b) => {
      const score = homeEventScore(b, preference) - homeEventScore(a, preference);
      return (
        score ||
        a.eventDate.getTime() - b.eventDate.getTime() ||
        a.eventName.localeCompare(b.eventName, 'zh-CN')
      );
    });
    const fill = (items: any[], count: number) => {
      for (const event of automatic) {
        if (items.length >= count) break;
        if (!used.has(event.id)) {
          used.add(event.id);
          items.push(event);
        }
      }
      return items.slice(0, count);
    };
    const focus = fill(manual('focus'), 2);
    const editorsPick = fill(manual('editors_pick'), 6);
    const signupSoonManual = manual('signup_soon');
    // 即将开报允许与其他分组重复：赛事总量少时，报名中的赛事值得同时出现在「即将开报」。
    const signupSoon = [...signupSoonManual, ...events]
      .filter((event) =>
        ['not_started', 'unknown', 'signup_open'].includes(event.signupStatus),
      )
      .filter((event, index, arr) => arr.findIndex((e) => e.id === event.id) === index)
      .sort(
        (a, b) =>
          (a.signupStartAt?.getTime() || Infinity) - (b.signupStartAt?.getTime() || Infinity),
      )
      .slice(0, 6);
    // 推荐区允许与其他分组重复（赛事总量少时，focus/editorsPick 已占满，推荐区需独立取数）。
    const recommendedManual = manual('recommended');
    const recommended = [...recommendedManual, ...automatic]
      .filter((event, index, arr) => arr.findIndex((e) => e.id === event.id) === index)
      .slice(0, 6);
    const selectedEvents = [...focus, ...editorsPick, ...signupSoon, ...recommended];
    const selectedMedia = await resolvePublicMediaBatch(selectedEvents);
    const mediaByEventId = new Map(
      selectedEvents.map((event, index) => [event.id, selectedMedia[index]]),
    );
    const present = (items: any[]) =>
      items.map((event) => ({
        ...event,
        ...mediaByEventId.get(event.id),
        sourceReviewPending: false,
      }));
    res.json({
      month,
      focusEvents: present(focus),
      editorsPicks: present(editorsPick),
      signupSoon: present(signupSoon),
      recommended: present(recommended),
      complianceNotice,
      officialActionText,
    });
  }),
);

app.get(
  '/api/events',
  asyncHandler(async (req, res) => {
    const query = validateQuery(publicEventsQuerySchema, req.query) as PublicEventsQuery;
    const { page, pageSize } = query;
    const where: Prisma.EventWhereInput = buildPublicEventWhere();
    if (query.city) where.city = query.city;
    if (query.provinceCode) where.provinceCode = query.provinceCode;
    if (query.cityCode) where.cityCode = query.cityCode;
    if (query.month) {
      const { start, end } = homeMonthRange(query.month);
      where.eventDate = { gte: start, lt: end };
    }
    if (query.distance) where.distanceItems = { has: query.distance };
    if (query.signupStatus) where.signupStatus = query.signupStatus;
    if (query.runJudgement) where.runJudgement = query.runJudgement;
    if (query.search) where.eventName = { contains: query.search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      prisma.event.findMany({
        where,
        select: {
          id: true,
          eventName: true,
          city: true,
          provinceCode: true,
          cityCode: true,
          eventDate: true,
          eventStartAt: true,
          distanceItems: true,
          signupStatus: true,
          signupDeadline: true,
          runJudgement: true,
          judgementSummary: true,
          judgementReasons: true,
          tags: true,
          updatedAt: true,
          sourceCheckedAt: true,
          changeAlerts: { where: { status: 'open' }, select: { id: true }, take: 1 },
          sourceSummaries: {
            where: { status: 'published' },
            select: { staleAt: true },
            orderBy: { publishedAt: 'desc' },
            take: 1,
          },
          mediaAssets: {
            where: { reviewStatus: 'approved_for_display' },
            orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
            take: 3,
          },
        },
        orderBy:
          query.sort === 'latest'
            ? [{ updatedAt: 'desc' }]
            : query.sort === 'signup_deadline'
              ? [{ signupDeadline: 'asc' }, { eventDate: 'asc' }]
              : [{ eventDate: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.event.count({ where }),
    ]);
    const resolvedMedia = await resolvePublicMediaBatch(items);
    res.json({
      items: items.map(({ changeAlerts, sourceSummaries, mediaAssets, ...event }, index) => ({
        ...event,
        ...resolvedMedia[index],
        sourceReviewPending: changeAlerts.length > 0,
        hasSourceSummary: sourceSummaries.length > 0,
        sourceSummaryStale: Boolean(sourceSummaries[0]?.staleAt),
      })),
      total,
      page,
      pageSize,
      complianceNotice,
      officialActionText,
    });
  }),
);

app.get(
  '/api/events/:id',
  asyncHandler(async (req, res) => {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, ...buildPublicEventWhere() },
      include: {
        checklistItems: { orderBy: { sortOrder: 'asc' } },
        eventTags: true,
        changeAlerts: { where: { status: 'open' }, select: { id: true }, take: 1 },
        sourceSummaries: {
          where: { status: 'published' },
          select: { staleAt: true },
          orderBy: { publishedAt: 'desc' },
          take: 1,
        },
        shareOverride: true,
        mediaAssets: {
          where: { reviewStatus: 'approved_for_display' },
          orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
          take: 3,
        },
      },
    });
    if (!event) throw new HttpError(404, '赛事不存在或未发布');
    const { changeAlerts, sourceSummaries, shareOverride, mediaAssets, ...publicEvent } = event;
    const [choiceCounts, shareSettings, reminderOptions] = await Promise.all([
      getEventChoiceCounts(event.id),
      getPublicShareSettings(),
      reminderRequestEnabled(req) ? reminderOptionsForEvent(event.id) : Promise.resolve(null),
    ]);
    const resolvedShare = resolveShareSetting(
      shareSettings,
      'event_detail',
      {
        eventName: event.eventName,
        city: event.city,
        eventDate: event.eventDate.toISOString().slice(0, 10),
        distance: event.distanceItems.join('、'),
        judgement: event.runJudgement,
      },
      shareOverride || {},
    );
    const [resolvedMedia] = await resolvePublicMediaBatch([{ mediaAssets }]);
    res.json({
      event: {
        ...publicEvent,
        ...resolvedMedia,
        sourceReviewPending: changeAlerts.length > 0,
        hasSourceSummary: sourceSummaries.length > 0,
        sourceSummaryStale: Boolean(sourceSummaries[0]?.staleAt),
        choiceCounts,
        reminderOptions: reminderOptions ?? [],
        resolvedShare,
      },
      complianceNotice,
      officialActionText,
    });
  }),
);

app.get(
  '/api/events/:id/source-summary',
  asyncHandler(async (req, res) => {
    try {
      res.json(await getPublicSourceSummary(req.params.id));
    } catch (error) {
      sourceSummaryHttpError(error);
    }
  }),
);

app.put(
  '/api/event-choices',
  asyncHandler(async (req, res) => {
    const input = validateBody(eventChoiceSchema, req.body);
    const user = await getRequestUser(req);
    try {
      await prisma.$transaction((tx) =>
        consumeFeedbackRateLimit(tx, eventChoiceRateLimit, input.userKey, new Date()),
      );
      const result = await setEventChoice({ ...input, userId: user?.id });
      if (user) await recordUserActivity({ userId: user.id, action: 'setChoice' });
      res.json(result);
    } catch (error) {
      if (error instanceof EventChoiceNotFoundError) throw new HttpError(404, error.message);
      throw error;
    }
  }),
);

app.get(
  '/api/event-choices',
  asyncHandler(async (req, res) => {
    const query = validateQuery(eventChoiceQuerySchema, req.query);
    const user = await getRequestUser(req);
    res.json(await listViewerEventChoices({ ...query, userId: user?.id }));
  }),
);

app.get(
  '/api/event-choices/:eventId',
  asyncHandler(async (req, res) => {
    const query = validateQuery(eventChoiceQuerySchema.pick({ userKey: true }), req.query);
    const user = await getRequestUser(req);
    res.json(
      await getViewerEventChoice({
        userKey: query.userKey,
        userId: user?.id,
        eventId: req.params.eventId,
      }),
    );
  }),
);

app.delete(
  '/api/event-choices/:eventId',
  asyncHandler(async (req, res) => {
    const query = validateQuery(eventChoiceQuerySchema.pick({ userKey: true }), req.query);
    const user = await getRequestUser(req);
    res.json(
      await removeEventChoice({
        userKey: query.userKey,
        userId: user?.id,
        eventId: req.params.eventId,
      }),
    );
  }),
);

app.post(
  '/api/preferences',
  asyncHandler(async (req, res) => {
    const input = validateBody(preferenceSchema, req.body);
    const user = await getRequestUser(req);
    const preference = user
      ? await prisma.userPreference.upsert({
          where: { userId: user.id },
          create: { ...input, userId: user.id },
          update: {
            userKey: input.userKey,
            cities: input.cities,
            provinceCodes: input.provinceCodes,
            cityCodes: input.cityCodes,
            distances: input.distances,
            focusTags: input.focusTags,
          },
        })
      : await prisma.userPreference.upsert({
          where: { userKey: input.userKey },
          create: input,
          update: {
            cities: input.cities,
            provinceCodes: input.provinceCodes,
            cityCodes: input.cityCodes,
            distances: input.distances,
            focusTags: input.focusTags,
          },
        });
    res.status(201).json(preference);
  }),
);

app.get(
  '/api/preferences/:userKey',
  asyncHandler(async (req, res) => {
    const user = await getRequestUser(req);
    const preference = await prisma.userPreference.findFirst({
      where: user ? { userId: user.id } : { userKey: req.params.userKey },
    });
    // 无偏好记录时返回 200 + null，作为"尚无偏好"的语义化信号，
    // 避免新用户/清过数据的用户在控制台看到 404 噪音。
    res.json(preference ?? null);
  }),
);

app.post(
  '/api/favorites',
  asyncHandler(async (req, res) => {
    const input = validateBody(favoriteSchema, req.body);
    const user = await getRequestUser(req);
    const event = await prisma.event.findFirst({
      where: { id: input.eventId, ...buildPublicEventWhere() },
    });
    if (!event) throw new HttpError(404, '赛事不存在或未发布');
    const favorite = user
      ? await prisma.userFavorite.upsert({
          where: { userId_eventId: { userId: user.id, eventId: input.eventId } },
          create: { ...input, userId: user.id },
          update: { userKey: input.userKey },
        })
      : await prisma.userFavorite.upsert({
          where: { userKey_eventId: { userKey: input.userKey, eventId: input.eventId } },
          create: input,
          update: {},
        });
    if (user) await recordUserActivity({ userId: user.id, action: 'addedFavorite' });
    res.status(201).json(favorite);
  }),
);

app.delete(
  '/api/favorites/:eventId',
  asyncHandler(async (req, res) => {
    const userKey = String(req.query.userKey || '');
    if (!userKey) throw new HttpError(400, 'userKey 不能为空');
    const user = await getRequestUser(req);
    await prisma.userFavorite.deleteMany({
      where: user
        ? { userId: user.id, eventId: req.params.eventId }
        : { userKey, eventId: req.params.eventId },
    });
    res.status(204).send();
  }),
);

app.get(
  '/api/favorites',
  asyncHandler(async (req, res) => {
    const userKey = String(req.query.userKey || '');
    if (!userKey) throw new HttpError(400, 'userKey 不能为空');
    const user = await getRequestUser(req);
    const items = await prisma.userFavorite.findMany({
      where: {
        ...(user ? { userId: user.id } : { userKey }),
        event: buildPublicEventWhere(),
      },
      include: {
        event: {
          include: {
            changeAlerts: { where: { status: 'open' }, select: { id: true }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      items: items.map(({ event, ...favorite }) => {
        const { changeAlerts, ...publicEvent } = event;
        return {
          ...favorite,
          event: { ...publicEvent, sourceReviewPending: changeAlerts.length > 0 },
        };
      }),
    });
  }),
);

app.post(
  '/api/feedback',
  asyncHandler(async (req, res) => {
    const input = validateBody(publicFeedbackSchema, req.body) as PublicFeedbackInput;
    const user = await getRequestUser(req);
    const content = normalizeFeedbackContent(input.content);
    const risk = classifyFeedbackRisk(content);
    if (risk.suspicious) {
      try {
        await recordBlockedFeedback(risk.reason);
      } catch (error) {
        console.error('记录反馈拦截指标失败', error instanceof Error ? error.name : 'unknown');
      }
      throw new HttpError(400, '反馈内容格式异常，请修改后重试');
    }
    if (input.scope === 'event_correction') {
      const event = await prisma.event.findFirst({
        where: { id: input.eventId, ...buildPublicEventWhere() },
      });
      if (!event) throw new HttpError(404, '赛事不存在或未发布');
    }
    const fingerprint = createFeedbackFingerprint(feedbackAbuseSecret, {
      scope: input.scope,
      eventId: input.eventId,
      feedbackType: input.feedbackType,
      content,
    });
    const existing = await findExistingFeedback(input.requestId, fingerprint);
    if (existing) {
      res.status(200).json({ id: existing.id, duplicate: true, message: '相同反馈已收到' });
      return;
    }

    const now = new Date();
    const sourceIp = getClientIp(req);
    try {
      const feedback = await prisma.$transaction(async (tx) => {
        // 先占用指纹，再写限流计数；并发相同提交会在唯一约束处回滚为一条记录。
        await tx.feedbackFingerprint.deleteMany({
          where: { fingerprint, expiresAt: { lte: now } },
        });
        const created = await tx.feedback.create({
          data: {
            eventId: input.eventId,
            userKey: input.userKey,
            userId: user?.id,
            scope: input.scope,
            requestId: input.requestId,
            fingerprint,
            feedbackType: input.feedbackType,
            content,
            contextPage: input.contextPage,
            appVersion: input.appVersion,
            relatedRequestId: input.relatedRequestId,
          },
        });
        await tx.feedbackFingerprint.create({
          data: {
            fingerprint,
            feedbackId: created.id,
            expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          },
        });
        if (input.scope === 'event_correction') {
          await consumeFeedbackRateLimit(
            tx,
            feedbackRateLimits.userEvent,
            `${input.userKey}\n${input.eventId}`,
            now,
          );
        } else {
          await consumeFeedbackRateLimit(tx, feedbackRateLimits.userProduct, input.userKey, now);
        }
        await consumeFeedbackRateLimit(tx, feedbackRateLimits.ipShort, sourceIp, now);
        await consumeFeedbackRateLimit(tx, feedbackRateLimits.ipDaily, sourceIp, now);
        return created;
      });
      res.status(201).json({ id: feedback.id, duplicate: false });
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await findExistingFeedback(input.requestId, fingerprint);
        if (duplicate) {
          res.status(200).json({ id: duplicate.id, duplicate: true, message: '相同反馈已收到' });
          return;
        }
      }
      throw error;
    }
  }),
);

app.post(
  '/api/share-records',
  asyncHandler(async (req, res) => {
    const input = validateBody(shareRecordSchema, req.body);
    const user = await getRequestUser(req);
    const shareToken = input.requestShareToken ? createShareToken() : null;
    const record = await prisma.shareRecord.create({
      data: {
        userKey: input.userKey,
        userId: user?.id,
        userKeyHash: user ? hmacDigest(userHashSecret, input.userKey) : null,
        shareToken,
        tokenExpiresAt: shareToken ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
        eventId: input.eventId || null,
        shareType: input.shareType,
        scene: input.scene,
      },
    });
    if (user) await recordUserActivity({ userId: user.id, action: 'startedShare' });
    res.status(201).json({ id: record.id, shareToken });
  }),
);

app.post(
  '/api/interactions',
  asyncHandler(async (req, res) => {
    const input = validateBody(interactionSchema, req.body);
    const user = await getRequestUser(req);
    const event = await prisma.event.findFirst({
      where: { id: input.eventId, ...buildPublicEventWhere() },
      select: { id: true },
    });
    if (!event) throw new HttpError(404, '赛事不存在或未发布');
    await recordEventInteraction({ ...input, secret: feedbackAbuseSecret });
    if (user) {
      await recordUserActivity({
        userId: user.id,
        action: input.action === 'event_detail_view' ? 'viewedDetail' : 'copiedOfficial',
      });
    }
    res.status(201).json({ recorded: true });
  }),
);

app.get(
  '/api/wxacode',
  asyncHandler(async (req, res) => {
    const eventId = String(req.query.eventId || '');
    if (!eventId) throw new HttpError(400, 'eventId 不能为空');
    const envVersion = z
      .enum(['develop', 'trial', 'release'])
      .default('release')
      .parse(req.query.envVersion);
    // scene 值需 <=32 字符且为安全字符集。cuid 约 24 字符，id= 前缀共 27 字符，符合限制。
    const buffer = await getMiniProgramCode(
      `id=${eventId}`,
      'pages/event-detail/index',
      envVersion,
    );
    if (!buffer) throw new HttpError(503, '小程序码服务暂不可用');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Vary', 'Accept-Encoding');
    res.send(buffer);
  }),
);

const defaultChecklistTemplates: Record<
  string,
  Array<{ groupName: string; itemName: string; itemStatus: string; sortOrder: number }>
> = {
  general: [
    {
      groupName: '报名信息',
      itemName: '报名截止与是否抽签',
      itemStatus: 'pending_verify',
      sortOrder: 1,
    },
    {
      groupName: '领物安排',
      itemName: '领物时间、地点、证件要求',
      itemStatus: 'pending_verify',
      sortOrder: 2,
    },
    {
      groupName: '交通安排',
      itemName: '起终点交通、存包和接驳',
      itemStatus: 'pending_verify',
      sortOrder: 3,
    },
    {
      groupName: '装备',
      itemName: '号码布、芯片、跑鞋、补给',
      itemStatus: 'pending_verify',
      sortOrder: 4,
    },
    {
      groupName: '风险提示',
      itemName: '天气变化和赛事变更公告',
      itemStatus: 'pending_verify',
      sortOrder: 5,
    },
  ],
  '5K': [
    {
      groupName: '完赛目标',
      itemName: '确认起跑时间和关门时间',
      itemStatus: 'pending_verify',
      sortOrder: 1,
    },
    {
      groupName: '装备',
      itemName: '轻便跑鞋和基础补水',
      itemStatus: 'pending_verify',
      sortOrder: 2,
    },
    {
      groupName: '新手提醒',
      itemName: '赛前不临时更换新装备',
      itemStatus: 'pending_verify',
      sortOrder: 3,
    },
    {
      groupName: '交通安排',
      itemName: '提前确认短距离项目检录口',
      itemStatus: 'pending_verify',
      sortOrder: 4,
    },
  ],
  '10K': [
    {
      groupName: '配速计划',
      itemName: '确认目标配速和补给点位置',
      itemStatus: 'pending_verify',
      sortOrder: 1,
    },
    {
      groupName: '装备',
      itemName: '跑鞋、能量胶或随身补给',
      itemStatus: 'pending_verify',
      sortOrder: 2,
    },
    {
      groupName: '赛事规则',
      itemName: '确认分区、检录和关门时间',
      itemStatus: 'pending_verify',
      sortOrder: 3,
    },
    {
      groupName: '恢复安排',
      itemName: '赛后换衣、拉伸和返程路线',
      itemStatus: 'pending_verify',
      sortOrder: 4,
    },
  ],
  half: [
    {
      groupName: '训练状态',
      itemName: '确认最近长距离训练和身体状态',
      itemStatus: 'pending_verify',
      sortOrder: 1,
    },
    {
      groupName: '补给策略',
      itemName: '确认能量胶、水站和盐丸安排',
      itemStatus: 'pending_verify',
      sortOrder: 2,
    },
    {
      groupName: '赛事规则',
      itemName: '确认半马关门时间和医疗点',
      itemStatus: 'pending_verify',
      sortOrder: 3,
    },
    {
      groupName: '装备',
      itemName: '比赛鞋、袜子、防磨和号码布固定',
      itemStatus: 'pending_verify',
      sortOrder: 4,
    },
  ],
  full: [
    {
      groupName: '身体状态',
      itemName: '确认无伤病、睡眠和赛前减量',
      itemStatus: 'pending_verify',
      sortOrder: 1,
    },
    {
      groupName: '补给策略',
      itemName: '确认全程补给节奏和备用方案',
      itemStatus: 'pending_verify',
      sortOrder: 2,
    },
    {
      groupName: '赛事规则',
      itemName: '确认分段关门时间、医疗点和退赛车',
      itemStatus: 'pending_verify',
      sortOrder: 3,
    },
    {
      groupName: '赛后安排',
      itemName: '确认完赛后保暖、换衣和返程',
      itemStatus: 'pending_verify',
      sortOrder: 4,
    },
  ],
};

app.get(
  '/api/checklist/templates',
  asyncHandler(async (req, res) => {
    const type = String(req.query.type || 'general');
    // 优先读 system_config checklist_templates（与后台内容配置页联动），fallback 到内置默认。
    let items: Array<{
      groupName: string;
      itemName: string;
      itemStatus: string;
      sortOrder: number;
    }> = defaultChecklistTemplates.general;
    try {
      const config = await prisma.systemConfig.findUnique({
        where: { configKey: 'checklist_templates' },
      });
      const templates =
        (config?.configValue as Record<string, unknown>) || defaultChecklistTemplates;
      const candidate = templates[type] || templates.general || defaultChecklistTemplates.general;
      if (Array.isArray(candidate)) {
        items = candidate as typeof items;
      }
    } catch {
      // 读配置失败时用默认值，保证接口可用
    }
    res.json({ items });
  }),
);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: '接口不存在', requestId: res.locals.requestId });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const requestId = String(res.locals.requestId || randomUUID());
  if (err instanceof ZodError) {
    res.status(400).json({
      message: err.issues.map((issue) => issue.message).join('；'),
      requestId,
    });
    return;
  }
  if (err instanceof HttpError) {
    if (err instanceof RateLimitError) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds));
    }
    res.status(err.status).json({ message: err.message, requestId });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    res.status(400).json({ message: '数据操作失败，请检查提交内容', requestId });
    return;
  }
  const category = err.name.startsWith('PrismaClient') ? 'database_error' : 'internal_error';
  void recordApiErrorMetric({ path: req.path, category }).catch(() => undefined);
  console.error(
    JSON.stringify({
      event: 'api_request_failed',
      requestId,
      routeGroup: apiRouteGroup(req.path),
      method: req.method,
      status: 500,
      category,
      durationMs: Math.max(0, Date.now() - Number(res.locals.requestStartedAt || Date.now())),
      release,
    }),
  );
  res.status(500).json({ message: '服务器内部错误', requestId });
});

const server = app.listen(port, host, () => {
  console.log(`worth-running api listening on http://${host}:${port}`);
});

let shutdownStarted = false;
async function shutdown(signal: string, exitCode: number) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(JSON.stringify({ event: 'api_shutdown_started', signal, release }));
  const result = await runGracefulShutdown({
    closeServer: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
    disconnectDatabase: () => prisma.$disconnect().catch(() => undefined),
  });
  if (result.timedOut) server.closeAllConnections();
  console.log(
    JSON.stringify({ event: 'api_shutdown_completed', signal, timedOut: result.timedOut }),
  );
  process.exit(exitCode);
}

process.once('SIGTERM', () => void shutdown('SIGTERM', 0));
process.once('SIGINT', () => void shutdown('SIGINT', 0));
process.once('uncaughtException', () => void shutdown('uncaughtException', 1));
process.once('unhandledRejection', () => void shutdown('unhandledRejection', 1));

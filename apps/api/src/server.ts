import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import type { CorsOptions } from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { EventCandidateStatus, Prisma, prisma } from '@worth-running/database';
import {
  AdminRole,
  feedbackStatusValues,
  infoStatusValues,
  publishStatusValues,
  runJudgementValues,
  signupStatusValues,
  sourceLevelValues,
} from '@worth-running/shared';
import type {
  FeedbackStatus,
  InfoStatus,
  PublishStatus,
  RunJudgement,
  SignupStatus,
  SourceLevel,
} from '@worth-running/shared';
import { z, ZodError } from 'zod';
import { aiEventCandidateSchema } from './ai/eventCandidateSchema.js';
import { getMiniProgramCode } from './wxacode.js';

const app = express();
const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.HOST ?? '127.0.0.1';
const isProduction = process.env.NODE_ENV === 'production';
const allowDevAdmin = process.env.ALLOW_DEV_ADMIN === 'true';

if (isProduction && !process.env.ADMIN_TOKEN_SECRET) {
  throw new Error('生产环境必须配置 ADMIN_TOKEN_SECRET');
}

const tokenSecret = process.env.ADMIN_TOKEN_SECRET || 'worth-running-dev-secret';
const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const devCorsOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (corsOrigins.includes(origin) || (!isProduction && devCorsOriginPattern.test(origin))) {
      callback(null, true);
      return;
    }
    callback(new HttpError(403, 'CORS origin not allowed'));
  },
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

const complianceNotice = 'AI 整理，仅供参考，报名以官方为准。';
const officialActionText = '前往官方确认';
const dangerousKeywords = ['取消', '延期', '疑似', '网传', '非官方'];
const defaultAdmin = { id: 'seed-admin', role: 'super_admin' as AdminRole };

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
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
  eventDate: dateOnlySchema,
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

const optionalUrlSchema = z
  .union([
    z.string().trim().url('入口 URL 必须是有效 URL'),
    z.string().trim().length(0).transform(() => null),
    z.null(),
    z.undefined().transform(() => null),
  ])
  .transform((value): string | null => value ?? null);

const eventSourceSchema = z.object({
  name: z.string().trim().min(1, '赛事源名称不能为空'),
  sourceType: z.enum(['page_url', 'search_query', 'rss']).default('page_url'),
  entryUrl: optionalUrlSchema,
  searchQuery: z.string().trim().optional().nullable(),
  allowedDomains: z.array(z.string().trim().min(1)).default([]),
  cityHints: z.array(z.string().trim().min(1)).default([]),
  status: z.enum(['active', 'paused']).default('active'),
  notes: z.string().trim().optional().nullable(),
});

const eventCandidateStatusSchema = z.enum([
  'new',
  'needs_review',
  'accepted',
  'rejected',
  'merged',
]);

const candidateReviewSchema = z.object({
  action: z.enum(['accept', 'reject']),
  rejectReason: z.string().trim().max(500).optional(),
});

const candidatePatchSchema = z.object({
  extractedData: aiEventCandidateSchema,
});

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
  distances: stringArraySchema,
  focusTags: stringArraySchema,
});

const favoriteSchema = z.object({
  userKey: z.string().trim().min(1, 'userKey 不能为空'),
  eventId: z.string().trim().min(1, 'eventId 不能为空'),
});

const publicFeedbackSchema = z.object({
  eventId: z.string().trim().min(1, 'eventId 不能为空'),
  userKey: z.string().trim().min(1, 'userKey 不能为空'),
  feedbackType: z.string().trim().min(1, '反馈类型不能为空'),
  content: z.string().trim().min(1, '反馈内容不能为空').max(2000, '反馈内容过长'),
});

const shareRecordSchema = z.object({
  userKey: z.string().trim().min(1, 'userKey 不能为空').max(100),
  eventId: z.string().trim().min(1).optional(),
  shareType: z.enum(['page_share', 'image_generate']),
  scene: z.enum(['event_detail', 'after_favorite', 'home', 'events', 'share_card']),
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

const publicEventsQuerySchema = paginationQuerySchema.extend({
  search: queryStringSchema,
  city: queryStringSchema,
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
});

const adminFeedbackQuerySchema = paginationQuerySchema.extend({
  status: z.enum(feedbackStatusValues).optional(),
});

const operationLogsQuerySchema = paginationQuerySchema.extend({
  targetType: queryStringSchema,
  targetId: queryStringSchema,
  action: queryStringSchema,
});

type PublicEventsQuery = {
  page: number;
  pageSize: number;
  search?: string;
  city?: string;
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
};

type AdminFeedbackQuery = {
  page: number;
  pageSize: number;
  status?: FeedbackStatus;
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
  return {
    eventName: input.eventName,
    city: input.city,
    eventDate: parseEventDate(input.eventDate),
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

function validatePublish(event: Awaited<ReturnType<typeof prisma.event.findUnique>>) {
  if (!event) throw new HttpError(404, '赛事不存在');

  const missing: string[] = [];
  if (!event.eventName) missing.push('赛事名称');
  if (!event.city) missing.push('城市');
  if (!event.eventDate) missing.push('比赛日期');
  if (!event.distanceItems.length) missing.push('距离项目');
  if (!event.signupStatus) missing.push('报名状态');
  if (!event.officialUrl) missing.push('官方入口');
  if (!event.sourceName) missing.push('来源名称');
  if (!event.sourceLevel) missing.push('来源等级');
  if (!event.runJudgement) missing.push('跑前判断');
  if (missing.length > 0) throw new HttpError(400, `发布前必填缺失：${missing.join('、')}`);

  const text = [
    event.eventName,
    event.judgementSummary,
    event.officialUrl,
    event.sourceName,
    event.sourceUrl,
  ]
    .filter(Boolean)
    .join(' ');
  const matchedKeyword = dangerousKeywords.find((keyword) => text.includes(keyword));
  if (matchedKeyword) throw new HttpError(400, `命中禁止发布关键词：${matchedKeyword}`);
  if (event.infoStatus === 'user_flagged') {
    throw new HttpError(400, '信息状态为用户反馈异常，处理前不能发布');
  }
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

app.get(
  '/health',
  asyncHandler(async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, database: 'ok', timestamp: new Date().toISOString() });
    } catch {
      res
        .status(503)
        .json({ ok: false, database: 'error', timestamp: new Date().toISOString() });
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
    const [totalEvents, publishedEvents, pendingVerifyEvents, pendingFeedback, recentLogs] =
      await Promise.all([
        prisma.event.count(),
        prisma.event.count({ where: { publishStatus: 'published' } }),
        prisma.event.count({ where: { infoStatus: 'pending_verify' } }),
        prisma.feedback.count({ where: { status: 'pending' } }),
        prisma.adminOperationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
      ]);

    res.json({ totalEvents, publishedEvents, pendingVerifyEvents, pendingFeedback, recentLogs });
  }),
);

app.get(
  '/api/admin/events',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const query = validateQuery(adminEventsQuerySchema, req.query) as AdminEventsQuery;
    const { page, pageSize } = query;
    const where: Prisma.EventWhereInput = {};

    if (query.search) where.eventName = { contains: query.search, mode: 'insensitive' };
    if (query.city) where.city = query.city;
    if (query.signupStatus) where.signupStatus = query.signupStatus;
    if (query.publishStatus) where.publishStatus = query.publishStatus;
    if (query.infoStatus) where.infoStatus = query.infoStatus;
    if (query.runJudgement) where.runJudgement = query.runJudgement;

    const [items, total] = await Promise.all([
      prisma.event.findMany({
        where,
        include: { checklistItems: { orderBy: { sortOrder: 'asc' } }, eventTags: true },
        orderBy: [{ updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.event.count({ where }),
    ]);

    res.json({ items, total, page, pageSize });
  }),
);

app.post(
  '/api/admin/events',
  asyncHandler(async (req, res) => {
    const admin = requireRole(req, ['super_admin', 'event_operator']);
    const input = validateBody(eventSchema, req.body);
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
    const before = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: { checklistItems: true, eventTags: true },
    });
    if (!before) throw new HttpError(404, '赛事不存在');

    const updated = await prisma.$transaction(async (tx) => {
      await tx.eventChecklistItem.deleteMany({ where: { eventId: req.params.id } });
      await tx.eventTag.deleteMany({ where: { eventId: req.params.id } });
      return tx.event.update({
        where: { id: req.params.id },
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
    });

    await writeOperationLog({
      adminUserId: admin.id,
      action: 'event.update',
      targetType: 'events',
      targetId: updated.id,
      beforeValue: before,
      afterValue: updated,
      note: '编辑赛事',
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
  const before = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!before) throw new HttpError(404, '赛事不存在');
  if (status === 'published') validatePublish(before);

  const updated = await prisma.event.update({
    where: { id: req.params.id },
    data: {
      publishStatus: status,
      publishedAt: status === 'published' ? new Date() : before.publishedAt,
      archivedAt: status === 'archived' ? new Date() : before.archivedAt,
    },
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

    const [items, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        include: { event: { select: { id: true, eventName: true, city: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.feedback.count({ where }),
    ]);
    res.json({ items, total, page, pageSize });
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
    const input = validateBody(eventSourceSchema, req.body);
    const created = await prisma.eventSource.create({ data: input });
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
    const input = validateBody(eventSourceSchema, req.body);
    const before = await prisma.eventSource.findUnique({ where: { id: req.params.id } });
    if (!before) throw new HttpError(404, '赛事源不存在');
    const updated = await prisma.eventSource.update({
      where: { id: before.id },
      data: input,
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
    const source = await prisma.eventSource.findUnique({ where: { id: req.params.id } });
    if (!source) throw new HttpError(404, '赛事源不存在');
    if (source.status !== 'active') throw new HttpError(400, '赛事源未启用');

    const updated = await prisma.eventSource.update({
      where: { id: source.id },
      data: { lastRunAt: new Date(), lastRunStatus: 'extractor_not_configured' },
    });
    await writeOperationLog({
      adminUserId: admin.id,
      action: 'event_source.run',
      targetType: 'event_sources',
      targetId: source.id,
      beforeValue: source,
      afterValue: updated,
      note: '手动触发 AI 赛事源抽取，抽取引擎尚未接入',
    });
    throw new HttpError(503, 'AI 抽取服务尚未接入，赛事源已保存，下一步将接入抓取与抽取引擎');
  }),
);

app.get(
  '/api/admin/event-candidates',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const where: Prisma.EventCandidateWhereInput = {};
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    if (status) {
      const parsedStatus = eventCandidateStatusSchema.safeParse(status);
      if (!parsedStatus.success) throw new HttpError(400, '候选状态无效');
      where.status = parsedStatus.data as EventCandidateStatus;
    }
    const items = await prisma.eventCandidate.findMany({
      where,
      include: { source: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ items });
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

    const updated = await prisma.eventCandidate.update({
      where: { id: before.id },
      data: {
        eventName: input.extractedData.eventName,
        city: input.extractedData.city,
        eventDate: input.extractedData.eventDate
          ? new Date(`${input.extractedData.eventDate}T00:00:00.000Z`)
          : null,
        sourceUrl: input.extractedData.sourceUrl,
        officialUrl: input.extractedData.officialUrl,
        extractedData: input.extractedData as Prisma.InputJsonObject,
        evidence: input.extractedData.evidence as Prisma.InputJsonArray,
        confidence: input.extractedData.confidence as Prisma.InputJsonObject,
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

    const data = aiEventCandidateSchema.parse(candidate.extractedData);
    if (!data.officialUrl) {
      throw new HttpError(400, '候选赛事缺少官方入口，请先人工补充 officialUrl 后再采纳');
    }
    if (!data.sourceUrl) {
      throw new HttpError(400, '候选赛事缺少来源链接，请先人工补充 sourceUrl 后再采纳');
    }
    if (!data.eventDate) {
      throw new HttpError(400, '候选赛事缺少比赛日期，请先人工补充 eventDate 后再采纳');
    }
    const officialUrl = data.officialUrl;
    const sourceUrl = data.sourceUrl;
    const eventDate = data.eventDate;

    const result = await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          eventName: data.eventName,
          city: data.city,
          eventDate: parseEventDate(eventDate),
          distanceItems: data.distanceItems,
          signupStatus: data.signupStatus as SignupStatus,
          signupDeadline: data.signupDeadline ? new Date(data.signupDeadline) : null,
          officialUrl,
          sourceName: data.sourceName || 'AI 辅助抽取',
          sourceUrl,
          sourceLevel: data.sourceLevel as SourceLevel,
          publishStatus: 'draft',
          infoStatus: 'ai_generated',
          runJudgement: data.runJudgement as RunJudgement,
          judgementSummary: data.judgementSummary || null,
          judgementReasons: data.judgementReasons,
          suitableFor: data.suitableFor,
          notSuitableFor: data.notSuitableFor,
          tags: data.tags,
          fieldConfidence: {
            ...data.confidence,
            aiCandidateId: candidate.id,
          } as Prisma.InputJsonObject,
          eventTags: {
            create: data.tags.map((tagName) => ({ tagName, tagType: 'experience' })),
          },
        },
      });

      const accepted = await tx.eventCandidate.update({
        where: { id: candidate.id },
        data: {
          status: 'accepted',
          acceptedEventId: event.id,
          reviewedBy: admin.id,
          reviewedAt: new Date(),
        },
      });

      return { event, candidate: accepted };
    });

    await writeOperationLog({
      adminUserId: admin.id,
      action: 'event_candidate.accept',
      targetType: 'event_candidates',
      targetId: candidate.id,
      beforeValue: candidate,
      afterValue: { eventId: result.event.id, candidateId: result.candidate.id },
      note: 'AI 候选赛事采纳为人工待补充草稿',
    });

    res.status(201).json(result);
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
  '/api/admin/share-records/stats',
  asyncHandler(async (req, res) => {
    requireRole(req, ['super_admin', 'event_operator', 'content_reviewer', 'readonly']);
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [total, pageShares, imageGenerates, topEventsRaw, dailyRaw] = await Promise.all([
      prisma.shareRecord.count(),
      prisma.shareRecord.count({ where: { shareType: 'page_share' } }),
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
    const dailyMap = new Map<string, { pageShare: number; imageGenerate: number }>();
    for (const record of dailyRaw) {
      const day = record.createdAt.toISOString().slice(0, 10);
      const entry = dailyMap.get(day) || { pageShare: 0, imageGenerate: 0 };
      if (record.shareType === 'page_share') entry.pageShare += 1;
      else entry.imageGenerate += 1;
      dailyMap.set(day, entry);
    }
    const daily = Array.from(dailyMap.entries())
      .map(([day, counts]) => ({ day, ...counts, total: counts.pageShare + counts.imageGenerate }))
      .sort((a, b) => a.day.localeCompare(b.day));

    res.json({ total, pageShares, imageGenerates, topEvents, daily });
  }),
);

app.get(
  '/api/events',
  asyncHandler(async (req, res) => {
    const query = validateQuery(publicEventsQuerySchema, req.query) as PublicEventsQuery;
    const { page, pageSize } = query;
    const where: Prisma.EventWhereInput = { publishStatus: 'published' };
    if (query.city) where.city = query.city;
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
          eventDate: true,
          distanceItems: true,
          signupStatus: true,
          signupDeadline: true,
          runJudgement: true,
          judgementSummary: true,
          judgementReasons: true,
          tags: true,
          updatedAt: true,
        },
        orderBy: [{ eventDate: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.event.count({ where }),
    ]);
    res.json({ items, total, page, pageSize, complianceNotice, officialActionText });
  }),
);

app.get(
  '/api/events/:id',
  asyncHandler(async (req, res) => {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, publishStatus: 'published' },
      include: { checklistItems: { orderBy: { sortOrder: 'asc' } }, eventTags: true },
    });
    if (!event) throw new HttpError(404, '赛事不存在或未发布');
    res.json({ event, complianceNotice, officialActionText });
  }),
);

app.post(
  '/api/preferences',
  asyncHandler(async (req, res) => {
    const input = validateBody(preferenceSchema, req.body);
    const preference = await prisma.userPreference.upsert({
      where: { userKey: input.userKey },
      create: input,
      update: { cities: input.cities, distances: input.distances, focusTags: input.focusTags },
    });
    res.status(201).json(preference);
  }),
);

app.get(
  '/api/preferences/:userKey',
  asyncHandler(async (req, res) => {
    const preference = await prisma.userPreference.findUnique({
      where: { userKey: req.params.userKey },
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
    const event = await prisma.event.findFirst({
      where: { id: input.eventId, publishStatus: 'published' },
    });
    if (!event) throw new HttpError(404, '赛事不存在或未发布');
    const favorite = await prisma.userFavorite.upsert({
      where: { userKey_eventId: { userKey: input.userKey, eventId: input.eventId } },
      create: input,
      update: {},
    });
    res.status(201).json(favorite);
  }),
);

app.delete(
  '/api/favorites/:eventId',
  asyncHandler(async (req, res) => {
    const userKey = String(req.query.userKey || '');
    if (!userKey) throw new HttpError(400, 'userKey 不能为空');
    await prisma.userFavorite.deleteMany({ where: { userKey, eventId: req.params.eventId } });
    res.status(204).send();
  }),
);

app.get(
  '/api/favorites',
  asyncHandler(async (req, res) => {
    const userKey = String(req.query.userKey || '');
    if (!userKey) throw new HttpError(400, 'userKey 不能为空');
    const items = await prisma.userFavorite.findMany({
      where: { userKey, event: { publishStatus: 'published' } },
      include: { event: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items });
  }),
);

app.post(
  '/api/feedback',
  asyncHandler(async (req, res) => {
    const input = validateBody(publicFeedbackSchema, req.body);
    const event = await prisma.event.findFirst({
      where: { id: input.eventId, publishStatus: 'published' },
    });
    if (!event) throw new HttpError(404, '赛事不存在或未发布');
    const feedback = await prisma.feedback.create({
      data: {
        eventId: input.eventId,
        userKey: input.userKey,
        feedbackType: input.feedbackType,
        content: input.content,
      },
    });
    res.status(201).json(feedback);
  }),
);

app.post(
  '/api/share-records',
  asyncHandler(async (req, res) => {
    const input = validateBody(shareRecordSchema, req.body);
    const record = await prisma.shareRecord.create({
      data: {
        userKey: input.userKey,
        eventId: input.eventId || null,
        shareType: input.shareType,
        scene: input.scene,
      },
    });
    res.status(201).json({ id: record.id });
  }),
);

app.get(
  '/api/wxacode',
  asyncHandler(async (req, res) => {
    const eventId = String(req.query.eventId || '');
    if (!eventId) throw new HttpError(400, 'eventId 不能为空');
    // scene 值需 <=32 字符且为安全字符集。cuid 约 24 字符，id= 前缀共 27 字符，符合限制。
    const buffer = await getMiniProgramCode(`id=${eventId}`, 'pages/event-detail/index');
    if (!buffer) throw new HttpError(503, '小程序码服务暂不可用');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  }),
);

const defaultChecklistTemplates: Record<
  string,
  Array<{ groupName: string; itemName: string; itemStatus: string; sortOrder: number }>
> = {
  general: [
    { groupName: '报名信息', itemName: '报名截止与是否抽签', itemStatus: 'pending_verify', sortOrder: 1 },
    { groupName: '领物安排', itemName: '领物时间、地点、证件要求', itemStatus: 'pending_verify', sortOrder: 2 },
    { groupName: '交通安排', itemName: '起终点交通、存包和接驳', itemStatus: 'pending_verify', sortOrder: 3 },
    { groupName: '装备', itemName: '号码布、芯片、跑鞋、补给', itemStatus: 'pending_verify', sortOrder: 4 },
    { groupName: '风险提示', itemName: '天气变化和赛事变更公告', itemStatus: 'pending_verify', sortOrder: 5 },
  ],
  '5K': [
    { groupName: '完赛目标', itemName: '确认起跑时间和关门时间', itemStatus: 'pending_verify', sortOrder: 1 },
    { groupName: '装备', itemName: '轻便跑鞋和基础补水', itemStatus: 'pending_verify', sortOrder: 2 },
    { groupName: '新手提醒', itemName: '赛前不临时更换新装备', itemStatus: 'pending_verify', sortOrder: 3 },
    { groupName: '交通安排', itemName: '提前确认短距离项目检录口', itemStatus: 'pending_verify', sortOrder: 4 },
  ],
  '10K': [
    { groupName: '配速计划', itemName: '确认目标配速和补给点位置', itemStatus: 'pending_verify', sortOrder: 1 },
    { groupName: '装备', itemName: '跑鞋、能量胶或随身补给', itemStatus: 'pending_verify', sortOrder: 2 },
    { groupName: '赛事规则', itemName: '确认分区、检录和关门时间', itemStatus: 'pending_verify', sortOrder: 3 },
    { groupName: '恢复安排', itemName: '赛后换衣、拉伸和返程路线', itemStatus: 'pending_verify', sortOrder: 4 },
  ],
  half: [
    { groupName: '训练状态', itemName: '确认最近长距离训练和身体状态', itemStatus: 'pending_verify', sortOrder: 1 },
    { groupName: '补给策略', itemName: '确认能量胶、水站和盐丸安排', itemStatus: 'pending_verify', sortOrder: 2 },
    { groupName: '赛事规则', itemName: '确认半马关门时间和医疗点', itemStatus: 'pending_verify', sortOrder: 3 },
    { groupName: '装备', itemName: '比赛鞋、袜子、防磨和号码布固定', itemStatus: 'pending_verify', sortOrder: 4 },
  ],
  full: [
    { groupName: '身体状态', itemName: '确认无伤病、睡眠和赛前减量', itemStatus: 'pending_verify', sortOrder: 1 },
    { groupName: '补给策略', itemName: '确认全程补给节奏和备用方案', itemStatus: 'pending_verify', sortOrder: 2 },
    { groupName: '赛事规则', itemName: '确认分段关门时间、医疗点和退赛车', itemStatus: 'pending_verify', sortOrder: 3 },
    { groupName: '赛后安排', itemName: '确认完赛后保暖、换衣和返程', itemStatus: 'pending_verify', sortOrder: 4 },
  ],
};

app.get(
  '/api/checklist/templates',
  asyncHandler(async (req, res) => {
    const type = String(req.query.type || 'general');
    // 优先读 system_config checklist_templates（与后台内容配置页联动），fallback 到内置默认。
    let items: Array<{ groupName: string; itemName: string; itemStatus: string; sortOrder: number }> =
      defaultChecklistTemplates.general;
    try {
      const config = await prisma.systemConfig.findUnique({
        where: { configKey: 'checklist_templates' },
      });
      const templates = (config?.configValue as Record<string, unknown>) || defaultChecklistTemplates;
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

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ message: err.issues.map((issue) => issue.message).join('；') });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(err);
    res.status(400).json({ message: '数据操作失败，请检查提交内容' });
    return;
  }
  console.error(err);
  res.status(500).json({ message: '服务器内部错误' });
});

app.listen(port, host, () => {
  console.log(`worth-running api listening on http://${host}:${port}`);
});

import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { Prisma, prisma } from '@worth-running/database';
import {
  AdminRole,
  FeedbackStatus,
  InfoStatus,
  PublishStatus,
  RunJudgement,
  SignupStatus,
  SourceLevel,
} from '@worth-running/shared';
import { z, ZodError } from 'zod';

const app = express();
const port = Number(process.env.API_PORT ?? 4000);
const isProduction = process.env.NODE_ENV === 'production';
const tokenSecret =
  process.env.ADMIN_TOKEN_SECRET || process.env.DATABASE_URL || 'worth-running-dev-secret';

app.use(cors());
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

const publishStatusValues = ['draft', 'published', 'hidden', 'offline', 'archived'] as const;
const infoStatusValues = [
  'ai_generated',
  'pending_verify',
  'verified',
  'user_flagged',
  'source_error',
] as const;
const runJudgementValues = ['priority', 'watch', 'unverified'] as const;
const signupStatusValues = [
  'signup_open',
  'closing_soon',
  'closed',
  'not_started',
  'unknown',
] as const;
const sourceLevelValues = ['official', 'trusted', 'secondary', 'unknown'] as const;
const feedbackStatusValues = ['pending', 'handling', 'resolved', 'rejected'] as const;

const dateOnlySchema = z
  .string({ required_error: '比赛日期不能为空' })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '比赛日期格式应为 YYYY-MM-DD')
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), {
    message: '比赛日期无效',
  });

const optionalDateTimeSchema = z
  .preprocess((value) => (value === '' || value === undefined ? null : value), z.string().nullable())
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

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function validateBody<T>(schema: z.Schema<T>, value: unknown) {
  return schema.parse(value);
}

function parsePagination(req: Request) {
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100);
  return { page, pageSize };
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
  if (!isProduction) return defaultAdmin;
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

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'worth-running-api' });
});

app.post(
  '/api/admin/auth/login',
  asyncHandler(async (req, res) => {
    const input = validateBody(loginSchema, req.body);
    const admin = await prisma.adminUser.findUnique({ where: { username: input.username } });
    if (!admin || admin.status !== 'active' || !verifyPassword(input.password, admin.passwordHash)) {
      throw new HttpError(401, '用户名或密码错误');
    }
    const token = signPayload({
      adminUserId: admin.id,
      role: admin.role,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    });
    res.json({
      token,
      admin: { id: admin.id, username: admin.username, displayName: admin.displayName, role: admin.role },
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
    const { page, pageSize } = parsePagination(req);
    const where: Prisma.EventWhereInput = {};

    if (req.query.search) where.eventName = { contains: String(req.query.search), mode: 'insensitive' };
    if (req.query.city) where.city = String(req.query.city);
    if (req.query.signupStatus) where.signupStatus = String(req.query.signupStatus) as SignupStatus;
    if (req.query.publishStatus) where.publishStatus = String(req.query.publishStatus) as PublishStatus;
    if (req.query.infoStatus) where.infoStatus = String(req.query.infoStatus) as InfoStatus;
    if (req.query.runJudgement) where.runJudgement = String(req.query.runJudgement) as RunJudgement;

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
    const status = req.query.status ? (String(req.query.status) as FeedbackStatus) : undefined;
    const items = await prisma.feedback.findMany({
      where: { status },
      include: { event: { select: { id: true, eventName: true, city: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items });
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
    const { page, pageSize } = parsePagination(req);
    const where: Prisma.AdminOperationLogWhereInput = {};
    if (req.query.targetType) where.targetType = String(req.query.targetType);
    if (req.query.targetId) where.targetId = String(req.query.targetId);
    if (req.query.action) where.action = String(req.query.action);
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
  '/api/events',
  asyncHandler(async (req, res) => {
    const { page, pageSize } = parsePagination(req);
    const where: Prisma.EventWhereInput = { publishStatus: 'published' };
    if (req.query.city) where.city = String(req.query.city);
    if (req.query.distance) where.distanceItems = { has: String(req.query.distance) };
    if (req.query.signupStatus) where.signupStatus = String(req.query.signupStatus) as SignupStatus;
    if (req.query.runJudgement) where.runJudgement = String(req.query.runJudgement) as RunJudgement;
    if (req.query.search) where.eventName = { contains: String(req.query.search), mode: 'insensitive' };

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
    const preference = await prisma.userPreference.findUnique({ where: { userKey: req.params.userKey } });
    if (!preference) throw new HttpError(404, '偏好不存在');
    res.json(preference);
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

app.get('/api/checklist/templates', (_req, res) => {
  res.json({
    items: [
      { groupName: '报名信息', itemName: '报名截止', itemStatus: 'pending_verify', sortOrder: 1 },
      { groupName: '报名信息', itemName: '是否抽签', itemStatus: 'pending_verify', sortOrder: 2 },
      { groupName: '赛事规则', itemName: '关门时间', itemStatus: 'pending_verify', sortOrder: 3 },
      { groupName: '赛事服务', itemName: '领物时间', itemStatus: 'pending_verify', sortOrder: 4 },
      { groupName: '路线信息', itemName: '官方路线', itemStatus: 'pending_verify', sortOrder: 5 },
      { groupName: '风险提示', itemName: '天气变化', itemStatus: 'pending_verify', sortOrder: 6 },
      { groupName: '风险提示', itemName: '赛事变更公告', itemStatus: 'pending_verify', sortOrder: 7 },
    ],
  });
});

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

app.listen(port, () => {
  console.log(`worth-running api listening on http://localhost:${port}`);
});

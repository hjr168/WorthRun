import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { Prisma, prisma } from '@worth-running/database';
import {
  AdminRole,
  EventInput,
  EventListQuery,
  FeedbackStatus,
  InfoStatus,
  PublishStatus,
  RunJudgement,
  SignupStatus,
} from '@worth-running/shared';

const app = express();
const port = Number(process.env.API_PORT ?? 4000);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const defaultAdmin = {
  id: 'seed-admin',
  role: 'super_admin' as AdminRole,
};

const dangerousKeywords = ['取消', '延期', '疑似', '网传', '非官方'];

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function getAdmin(req: Request) {
  return {
    id: String(req.header('x-admin-user-id') || defaultAdmin.id),
    role: (req.header('x-admin-role') || defaultAdmin.role) as AdminRole,
  };
}

function requireRole(req: Request, allowed: AdminRole[]) {
  const admin = getAdmin(req);
  if (!allowed.includes(admin.role)) {
    throw new HttpError(403, '当前角色无权执行该操作');
  }
  return admin;
}

function parseArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function nullableDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function eventDataFromBody(body: Partial<EventInput>): Prisma.EventUncheckedCreateInput {
  return {
    eventName: String(body.eventName || '').trim(),
    city: String(body.city || '').trim(),
    eventDate: nullableDate(body.eventDate) ?? new Date(),
    distanceItems: parseArray(body.distanceItems),
    startPoint: body.startPoint?.trim() || null,
    endPoint: body.endPoint?.trim() || null,
    signupStatus: (body.signupStatus || 'unknown') as SignupStatus,
    signupStartAt: nullableDate(body.signupStartAt),
    signupDeadline: nullableDate(body.signupDeadline),
    officialUrl: String(body.officialUrl || '').trim(),
    sourceName: String(body.sourceName || '').trim(),
    sourceUrl: body.sourceUrl?.trim() || null,
    sourceLevel: String(body.sourceLevel || '').trim() || 'unknown',
    publishStatus: (body.publishStatus || 'draft') as PublishStatus,
    infoStatus: (body.infoStatus || 'pending_verify') as InfoStatus,
    runJudgement: (body.runJudgement || 'unverified') as RunJudgement,
    judgementSummary: body.judgementSummary?.trim() || null,
    judgementReasons: parseArray(body.judgementReasons),
    suitableFor: parseArray(body.suitableFor),
    notSuitableFor: parseArray(body.notSuitableFor),
    tags: parseArray(body.tags),
    fieldConfidence: (body.fieldConfidence || {}) as Prisma.InputJsonValue,
  };
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

app.get('/api/admin/dashboard', async (_req, res) => {
  const [totalEvents, publishedEvents, pendingVerifyEvents, pendingFeedback, recentLogs] =
    await Promise.all([
      prisma.event.count(),
      prisma.event.count({ where: { publishStatus: 'published' } }),
      prisma.event.count({ where: { infoStatus: 'pending_verify' } }),
      prisma.feedback.count({ where: { status: 'pending' } }),
      prisma.adminOperationLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);

  res.json({ totalEvents, publishedEvents, pendingVerifyEvents, pendingFeedback, recentLogs });
});

app.get('/api/admin/events', async (req, res) => {
  const query = req.query as EventListQuery;
  const page = Number(query.page || 1);
  const pageSize = Math.min(Number(query.pageSize || 20), 100);
  const where: Prisma.EventWhereInput = {};

  if (query.search) where.eventName = { contains: String(query.search), mode: 'insensitive' };
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
});

app.post('/api/admin/events', async (req, res) => {
  const admin = requireRole(req, ['super_admin', 'event_operator']);
  const input = req.body as EventInput;
  const event = await prisma.event.create({
    data: {
      ...eventDataFromBody(input),
      checklistItems: {
        create: (input.checklistItems || []).map((item, index) => ({
          groupName: item.groupName,
          itemName: item.itemName,
          itemStatus: item.itemStatus || 'pending_verify',
          description: item.description || null,
          sortOrder: item.sortOrder ?? index + 1,
        })),
      },
      eventTags: {
        create: (input.eventTags || []).map((tag) => ({
          tagName: tag.tagName,
          tagType: tag.tagType || 'experience',
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
});

app.get('/api/admin/events/:id', async (req, res) => {
  const event = await prisma.event.findUnique({
    where: { id: req.params.id },
    include: { checklistItems: { orderBy: { sortOrder: 'asc' } }, eventTags: true },
  });
  if (!event) throw new HttpError(404, '赛事不存在');
  res.json(event);
});

app.put('/api/admin/events/:id', async (req, res) => {
  const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
  const before = await prisma.event.findUnique({
    where: { id: req.params.id },
    include: { checklistItems: true, eventTags: true },
  });
  if (!before) throw new HttpError(404, '赛事不存在');

  const input = req.body as EventInput;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.eventChecklistItem.deleteMany({ where: { eventId: req.params.id } });
    await tx.eventTag.deleteMany({ where: { eventId: req.params.id } });
    return tx.event.update({
      where: { id: req.params.id },
      data: {
        ...eventDataFromBody(input),
        checklistItems: {
          create: (input.checklistItems || []).map((item, index) => ({
            groupName: item.groupName,
            itemName: item.itemName,
            itemStatus: item.itemStatus || 'pending_verify',
            description: item.description || null,
            sortOrder: item.sortOrder ?? index + 1,
          })),
        },
        eventTags: {
          create: (input.eventTags || []).map((tag) => ({
            tagName: tag.tagName,
            tagType: tag.tagType || 'experience',
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
});

async function changePublishStatus(req: Request, res: Response, status: PublishStatus, action: string) {
  const admin = requireRole(req, ['super_admin', 'event_operator']);
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
    note: req.body?.note || undefined,
  });

  res.json(updated);
}

app.patch('/api/admin/events/:id/publish', (req, res) =>
  changePublishStatus(req, res, 'published', 'event.publish'),
);
app.patch('/api/admin/events/:id/hide', (req, res) =>
  changePublishStatus(req, res, 'hidden', 'event.hide'),
);
app.patch('/api/admin/events/:id/offline', (req, res) =>
  changePublishStatus(req, res, 'offline', 'event.offline'),
);
app.patch('/api/admin/events/:id/archive', (req, res) =>
  changePublishStatus(req, res, 'archived', 'event.archive'),
);

app.get('/api/admin/feedback', async (_req, res) => {
  const items = await prisma.feedback.findMany({
    include: { event: { select: { id: true, eventName: true, city: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items });
});

app.get('/api/admin/feedback/:id', async (req, res) => {
  const feedback = await prisma.feedback.findUnique({
    where: { id: req.params.id },
    include: { event: true },
  });
  if (!feedback) throw new HttpError(404, '反馈不存在');
  res.json(feedback);
});

app.patch('/api/admin/feedback/:id/handle', async (req, res) => {
  const admin = requireRole(req, ['super_admin', 'event_operator', 'content_reviewer']);
  const before = await prisma.feedback.findUnique({ where: { id: req.params.id } });
  if (!before) throw new HttpError(404, '反馈不存在');
  const updated = await prisma.feedback.update({
    where: { id: req.params.id },
    data: {
      status: (req.body.status || 'resolved') as FeedbackStatus,
      adminNote: req.body.adminNote || null,
      handledBy: admin.id,
      handledAt: new Date(),
    },
  });
  await writeOperationLog({
    adminUserId: admin.id,
    action: 'feedback.handle',
    targetType: 'feedback',
    targetId: updated.id,
    beforeValue: before,
    afterValue: updated,
  });
  res.json(updated);
});

app.get('/api/admin/operation-logs', async (req, res) => {
  const targetType = req.query.targetType ? String(req.query.targetType) : undefined;
  const targetId = req.query.targetId ? String(req.query.targetId) : undefined;
  const items = await prisma.adminOperationLog.findMany({
    where: { targetType, targetId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ items });
});

app.get('/api/admin/system-configs', async (_req, res) => {
  const items = await prisma.systemConfig.findMany({ orderBy: { configKey: 'asc' } });
  res.json({ items });
});

app.put('/api/admin/system-configs/:key', async (req, res) => {
  const admin = requireRole(req, ['super_admin']);
  const before = await prisma.systemConfig.findUnique({ where: { configKey: req.params.key } });
  const updated = await prisma.systemConfig.upsert({
    where: { configKey: req.params.key },
    create: {
      configKey: req.params.key,
      configValue: req.body.configValue,
      description: req.body.description,
    },
    update: {
      configValue: req.body.configValue,
      description: req.body.description,
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
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ message: '服务器内部错误' });
});

app.listen(port, () => {
  console.log(`worth-running api listening on http://localhost:${port}`);
});

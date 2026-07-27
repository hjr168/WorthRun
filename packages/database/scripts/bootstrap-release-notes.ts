import { prisma } from '../src/index.js';

const apply = process.argv.includes('--apply');

const releaseNotes = [
  {
    version: 'V0.5.0',
    title: '匿名赛事选择与来源摘要',
    summary: '让跑者记录想跑、观望和已报名，并查看经人工确认的赛事来源摘要。',
    releasedAt: new Date('2026-07-17T00:00:00.000+08:00'),
    changes: [
      { category: 'feature', description: '新增想跑、观望、已报名三种匿名赛事选择。' },
      { category: 'feature', description: '新增赛事来源摘要，展示要点、依据和信息局限。' },
      { category: 'improvement', description: '选择统计仅展示匿名聚合结果，不展示参与者列表。' },
    ],
  },
  {
    version: 'V0.5.1',
    title: '产品反馈与稳定性提升',
    summary: '增加产品问题反馈入口，同时加强请求追踪、服务健康和异常处理能力。',
    releasedAt: new Date('2026-07-18T00:00:00.000+08:00'),
    changes: [
      { category: 'feature', description: '“我的”及关键错误状态可直接提交产品反馈。' },
      { category: 'improvement', description: '反馈回执增加请求编号，方便定位具体问题。' },
      { category: 'fix', description: '完善 API 健康检查、错误聚合和优雅停机处理。' },
    ],
  },
  {
    version: 'V0.5.2',
    title: '分享与版本更新中心',
    summary: '统一好友与朋友圈分享入口，并在“我的”集中查看版本更新时间线。',
    releasedAt: new Date('2026-07-21T00:00:00.000+08:00'),
    changes: [
      { category: 'feature', description: '公共页面统一接入好友/朋友圈分享，支持全局模板和单赛事覆盖。' },
      { category: 'feature', description: '“我的”新增本机未读红点与版本更新时间线。' },
      { category: 'improvement', description: '后台版本更新提供草稿、发布、下线和审计。' },
    ],
  },
  {
    version: 'V0.5.3',
    title: '用户体系与增长基线',
    summary: '微信登录与个人资料上线，并开始记录增长基线；提醒功能默认关闭，仅完成基础能力。',
    releasedAt: new Date('2026-07-22T00:00:00.000+08:00'),
    changes: [
      { category: 'feature', description: 'wx.login 静默绑定微信用户，OpenID 加密保存，跨设备登录合并偏好与收藏。' },
      { category: 'feature', description: '新增个人资料页，头像经 UniCloud 直传，ECS 只签发一次性凭证。' },
      { category: 'improvement', description: '记录日活、新用户、留存、行为漏斗与分享归因的增长基线。' },
      { category: 'feature', description: '报名与赛前提醒一次性任务（默认关闭，待灰度开启）。' },
    ],
  },
  {
    version: 'V0.5.4',
    title: '赛事可信核验与提醒灰度',
    summary: '新增赛事人工核验闭环，并按灰度开启赛事提醒订阅与发送。',
    releasedAt: new Date('2026-07-27T00:00:00.000+08:00'),
    changes: [
      { category: 'feature', description: '赛事新增精确开赛时间，后台支持核验预览、列表、摘要和批量应用。' },
      { category: 'improvement', description: '核验只接受未来大湾区、官方或可信来源且无开放告警的赛事，编辑后关键字段变化自动降级。' },
      { category: 'feature', description: '赛前与报名类提醒按真实时间触发，已发送记录永久保留，不重复发送。' },
      { category: 'feature', description: '小程序新增“我的提醒”页与赛事详情订阅面板，后台新增提醒列表与灰度观测。' },
    ],
  },
] as const;

async function main() {
  const existing = await prisma.releaseNote.findMany({
    where: { version: { in: releaseNotes.map((item) => item.version) } },
    select: { version: true },
  });
  const existingVersions = new Set(existing.map((item) => item.version));
  const pending = releaseNotes.filter((item) => !existingVersions.has(item.version));
  if (!apply) {
    console.log(
      JSON.stringify(
        { dryRun: true, create: pending.map((item) => item.version), skip: [...existingVersions] },
        null,
        2,
      ),
    );
    return;
  }
  for (const item of pending) {
    await prisma.releaseNote.create({
      data: {
        ...item,
        changes: item.changes.map((change) => ({ ...change })),
        status: 'draft',
      },
    });
  }
  console.log(
    JSON.stringify(
      {
        dryRun: false,
        created: pending.map((item) => item.version),
        skipped: [...existingVersions],
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

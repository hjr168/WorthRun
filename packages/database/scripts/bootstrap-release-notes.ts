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

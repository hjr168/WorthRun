import { Prisma, prisma } from '@worth-running/database';
import { persistEventCandidates } from './ai/persistEventCandidates.js';
import {
  buildChinaAthPlan2026Candidates,
  CHINAATH_PLAN_2026_URL,
  chinaAthPlan2026Records,
} from './chinaAthPlan2026.js';

const SOURCE_NAME = '中国田协2026年度赛事计划';

export interface ChinaAthPlanImportOptions {
  year: number;
  dryRun: boolean;
  expected?: number;
  now?: Date;
}

export async function runChinaAthPlanImport(options: ChinaAthPlanImportOptions) {
  if (options.year !== 2026) throw new Error('当前仅内置已核对的 2026 年中国田协计划');
  const candidates = buildChinaAthPlan2026Candidates();
  if (options.expected !== undefined && options.expected !== candidates.length) {
    throw new Error(`预期数量不一致：expected=${options.expected}，当前清单=${candidates.length}`);
  }
  const preview = {
    year: options.year,
    dryRun: options.dryRun,
    expected: candidates.length,
    completeDates: chinaAthPlan2026Records.filter((item) => item.eventDate).length,
    missingDates: chinaAthPlan2026Records.filter((item) => !item.eventDate).length,
    samples: chinaAthPlan2026Records.slice(0, 5).map((item) => item.eventName),
  };
  if (options.dryRun) return preview;

  let source = await prisma.eventSource.findFirst({
    where: { name: SOURCE_NAME, entryUrl: CHINAATH_PLAN_2026_URL },
  });
  if (!source) {
    source = await prisma.eventSource.create({
      data: {
        name: SOURCE_NAME,
        sourceType: 'page_url',
        entryUrl: CHINAATH_PLAN_2026_URL,
        allowedDomains: ['file.shuzixindong.com'],
        cityHints: [],
        sourceLevel: 'official',
        status: 'paused',
        scheduleEnabled: false,
        pageSize: 1,
        maxPagesPerRun: 1,
        notes: '仅供年度计划导入命令使用，不由 cron 执行。',
      },
    });
  } else if (source.sourceLevel !== 'official') {
    source = await prisma.eventSource.update({
      where: { id: source.id },
      data: { sourceLevel: 'official' },
    });
  }

  const summary = await persistEventCandidates(source.id, candidates, options.now ?? new Date());
  const result = { ...preview, sourceId: source.id, summary };
  await prisma.adminOperationLog.create({
    data: {
      action: 'event_source.import_chinaath_plan',
      targetType: 'event_sources',
      targetId: source.id,
      afterValue: result as unknown as Prisma.InputJsonValue,
      note: `导入中国田协2026年度计划：读取 ${summary.fetched}，新增 ${summary.created}，更新 ${summary.updated}，跳过已审核 ${summary.skippedReviewed}`,
    },
  });
  return result;
}

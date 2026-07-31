import { Prisma, prisma } from '@worth-running/database';
import { greaterBayAreaCities, supportedProvinceCodes } from '@worth-running/shared';
import { isNationwideDiscoveryEnabled } from './dataPolicy.js';
import {
  CHINAATH_ALLOWED_DOMAINS,
  CHINAATH_MAINLAND_CITIES,
  CHINAATH_PUBLIC_LIST_URL,
  CHINAMARATHON_SITEMAP_URL,
  WORLD_ATHLETICS_CALENDAR_URL,
} from './ai/eventSourceConfig.js';

const MACAO_MARATHON_URL = 'https://www.macaomarathon.com/zh/information';
const HZMB_HALF_MARATHON_URL = 'https://hzmb-halfmarathon.com/zh_cn/important-information';

interface SourceDefinition {
  name: string;
  sourceType: 'page_url' | 'chinaath_api' | 'world_athletics' | 'chinamarathon_sitemap';
  entryUrl: string;
  allowedDomains: string[];
  cityHints: string[];
  provinceCodes?: string[];
  sourceLevel: 'official' | 'community';
  scheduleIntervalHours: number;
  pageSize: number;
  maxPagesPerRun: number;
  notes: string;
}

export function nationwideChinaAthSourceDefinitions(): SourceDefinition[] {
  const provinceNames: Record<string, string> = {
    '110000': '北京',
    '310000': '上海',
    '320000': '江苏',
    '330000': '浙江',
    '440000': '广东',
    '510000': '四川',
    '500000': '重庆',
    '420000': '湖北',
    '350000': '福建',
  };
  return supportedProvinceCodes
    .filter((code) => provinceNames[code])
    .map((provinceCode, index) => ({
      name: `中国田协官方赛事目录·${provinceNames[provinceCode]}`,
      sourceType: 'chinaath_api' as const,
      entryUrl: CHINAATH_PUBLIC_LIST_URL,
      allowedDomains: [...CHINAATH_ALLOWED_DOMAINS],
      cityHints: [],
      provinceCodes: [provinceCode],
      sourceLevel: 'official' as const,
      scheduleIntervalHours: 72,
      pageSize: 20,
      maxPagesPerRun: 2,
      notes: `按${provinceNames[provinceCode]}省级行政区分页抓取；与其他省份错峰 ${index * 15} 分钟，候选仍需人工审核。`,
    }));
}

export function v042EventSourceDefinitions(): SourceDefinition[] {
  const chinaAthSources = isNationwideDiscoveryEnabled()
    ? nationwideChinaAthSourceDefinitions()
    : CHINAATH_MAINLAND_CITIES.map((city) => ({
        name: `中国田协官方赛事目录·${city}`,
        sourceType: 'chinaath_api' as const,
        entryUrl: CHINAATH_PUBLIC_LIST_URL,
        allowedDomains: [...CHINAATH_ALLOWED_DOMAINS],
        cityHints: [city],
        sourceLevel: 'official' as const,
        scheduleIntervalHours: 24,
        pageSize: 20,
        maxPagesPerRun: 2,
        notes: `固定按${city}行政区划编码查询，每次最多2页。`,
      }));
  return [
    ...chinaAthSources,
    {
      name: '世界田联香港路跑日历',
      sourceType: 'world_athletics',
      entryUrl: WORLD_ATHLETICS_CALENDAR_URL,
      allowedDomains: ['worldathletics.org'],
      cityHints: ['香港'],
      sourceLevel: 'official',
      scheduleIntervalHours: 24,
      pageSize: 20,
      maxPagesPerRun: 1,
      notes: '固定读取香港未来一年 Road Running 赛事。',
    },
    {
      name: '中国马拉松社区赛事发现',
      sourceType: 'chinamarathon_sitemap',
      entryUrl: CHINAMARATHON_SITEMAP_URL,
      allowedDomains: ['chinamarathon.com', 'heilianapp.com'],
      cityHints: [...greaterBayAreaCities],
      sourceLevel: 'community',
      scheduleIntervalHours: 24,
      pageSize: 10,
      maxPagesPerRun: 1,
      notes: '社区聚合来源只生成待审核候选，不写入官方入口。',
    },
    {
      name: '澳门国际马拉松官网',
      sourceType: 'page_url',
      entryUrl: MACAO_MARATHON_URL,
      allowedDomains: ['macaomarathon.com'],
      cityHints: ['澳门'],
      sourceLevel: 'official',
      scheduleIntervalHours: 168,
      pageSize: 1,
      maxPagesPerRun: 1,
      notes: '官方单页来源，由 AI 抽取后人工核验。',
    },
    {
      name: '港珠澳大桥半马官网',
      sourceType: 'page_url',
      entryUrl: HZMB_HALF_MARATHON_URL,
      allowedDomains: ['hzmb-halfmarathon.com'],
      cityHints: ['香港'],
      sourceLevel: 'official',
      scheduleIntervalHours: 168,
      pageSize: 1,
      maxPagesPerRun: 1,
      notes: '官方单页来源，由 AI 抽取后人工核验。',
    },
  ];
}

export async function bootstrapV042EventSources(options: { dryRun: boolean; now?: Date }) {
  const now = options.now ?? new Date();
  const definitions = v042EventSourceDefinitions();
  const existing = await prisma.eventSource.findMany({ orderBy: { createdAt: 'asc' } });
  const targetNames = new Set(definitions.map((source) => source.name));
  const obsolete = existing.filter(
    (source) => source.sourceType === 'chinaath_api' && !targetNames.has(source.name),
  );
  const preview = {
    dryRun: options.dryRun,
    targetCount: definitions.length,
    create: definitions
      .filter((definition) => !existing.some((item) => item.name === definition.name))
      .map((item) => item.name),
    update: definitions
      .filter((definition) => existing.some((item) => item.name === definition.name))
      .map((item) => item.name),
    pause: obsolete.map((item) => item.name),
  };
  if (options.dryRun) return preview;

  await prisma.$transaction(async (tx) => {
    for (const source of obsolete) {
      await tx.eventSource.update({
        where: { id: source.id },
        data: { status: 'paused', scheduleEnabled: false, nextRunAt: null },
      });
    }
    for (const [index, definition] of definitions.entries()) {
      const found = existing.find((item) => item.name === definition.name);
      const data = {
        ...definition,
        status: 'active' as const,
        scheduleEnabled: true,
        nextPage: 1,
        nextRunAt: new Date(now.getTime() + (index + 1) * 15 * 60 * 1000),
      };
      if (found) await tx.eventSource.update({ where: { id: found.id }, data });
      else await tx.eventSource.create({ data });
    }
    await tx.adminOperationLog.create({
      data: {
        action: isNationwideDiscoveryEnabled()
          ? 'event_source.bootstrap_nationwide'
          : 'event_source.bootstrap_v0_4_2',
        targetType: 'event_sources',
        afterValue: preview as unknown as Prisma.InputJsonValue,
        note: `${isNationwideDiscoveryEnabled() ? '初始化全国赛事源' : '初始化 V0.4.2 赛事源'}：目标 ${definitions.length}，暂停旧来源 ${obsolete.length}`,
      },
    });
  });
  return preview;
}

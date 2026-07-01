import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  InfoStatus,
  Prisma,
  PrismaClient,
  RunJudgement,
  SignupStatus,
  SourceLevel,
} from '@prisma/client';

const prisma = new PrismaClient();

const headers = [
  'eventName',
  'city',
  'eventDate',
  'distanceItems',
  'signupStatus',
  'signupDeadline',
  'officialUrl',
  'sourceName',
  'sourceUrl',
  'sourceLevel',
  'runJudgement',
  'judgementSummary',
  'judgementReasons',
  'suitableFor',
  'notSuitableFor',
  'tags',
] as const;

type Header = (typeof headers)[number];
type Row = Record<Header, string>;
type Failure = { line: number; reason: string };

const signupStatusValues = new Set(Object.values(SignupStatus));
const sourceLevelValues = new Set(Object.values(SourceLevel));
const runJudgementValues = new Set(Object.values(RunJudgement));

const defaultChecklist = [
  ['报名信息', '官方报名入口', InfoStatus.pending_verify],
  ['报名信息', '报名截止时间', InfoStatus.pending_verify],
  ['赛事规则', '比赛日期与项目', InfoStatus.pending_verify],
  ['赛事规则', '关门时间', InfoStatus.pending_verify],
  ['路线信息', '起终点与路线', InfoStatus.pending_verify],
  ['赛事服务', '领物时间与地点', InfoStatus.pending_verify],
  ['风险提示', '赛事变更公告', InfoStatus.pending_verify],
] as const;

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('请提供 CSV 文件路径，例如：pnpm db:import-events -- ./docs/real-events-sample.csv');
    process.exit(1);
  }

  const filePath = resolve(process.cwd(), csvPath);
  const content = await readFile(filePath, 'utf8');
  const records = parseCsv(content);
  const [headerRow, ...dataRows] = records;

  if (!headerRow || !isExpectedHeader(headerRow)) {
    console.error(`CSV 表头必须为：${headers.join(',')}`);
    process.exit(1);
  }

  const adminUser = await prisma.adminUser.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } });
  const failures: Failure[] = [];
  const result = { created: 0, updated: 0, skipped: 0, failed: 0 };

  for (let index = 0; index < dataRows.length; index += 1) {
    const line = index + 2;
    const values = dataRows[index];
    if (values.every((value) => !value.trim())) {
      result.skipped += 1;
      continue;
    }

    const row = Object.fromEntries(headers.map((header, column) => [header, values[column]?.trim() ?? ''])) as Row;
    const validation = validateRow(row);
    if (validation.length) {
      result.failed += 1;
      failures.push({ line, reason: validation.join('；') });
      continue;
    }

    const eventDate = parseDateOnly(row.eventDate);
    const signupDeadline = row.signupDeadline ? new Date(row.signupDeadline) : null;
    const distanceItems = splitList(row.distanceItems);
    const judgementReasons = splitList(row.judgementReasons);
    const suitableFor = splitList(row.suitableFor);
    const notSuitableFor = splitList(row.notSuitableFor);
    const tags = splitList(row.tags);

    try {
      const existing = await prisma.event.findFirst({
        where: {
          eventName: row.eventName,
          city: row.city,
          eventDate,
        },
      });

      const baseData = {
        eventName: row.eventName,
        city: row.city,
        eventDate,
        distanceItems,
        signupStatus: row.signupStatus as SignupStatus,
        signupDeadline,
        officialUrl: row.officialUrl,
        sourceName: row.sourceName,
        sourceUrl: row.sourceUrl || null,
        sourceLevel: row.sourceLevel as SourceLevel,
        infoStatus: InfoStatus.pending_verify,
        runJudgement: row.runJudgement as RunJudgement,
        judgementSummary: row.judgementSummary || null,
        judgementReasons,
        suitableFor,
        notSuitableFor,
        tags,
        fieldConfidence: {
          importedFromCsv: 'pending_verify',
          sourceUrl: row.sourceUrl ? 'pending_verify' : 'source_error',
        } satisfies Prisma.InputJsonObject,
      };

      const saved = await prisma.$transaction(async (tx) => {
        if (existing) {
          await tx.eventChecklistItem.deleteMany({ where: { eventId: existing.id } });
          await tx.eventTag.deleteMany({ where: { eventId: existing.id } });

          const updated = await tx.event.update({
            where: { id: existing.id },
            data: {
              ...baseData,
              checklistItems: {
                create: defaultChecklist.map(([groupName, itemName, itemStatus], checklistIndex) => ({
                  groupName,
                  itemName,
                  itemStatus,
                  sortOrder: checklistIndex + 1,
                })),
              },
              eventTags: {
                create: tags.map((tagName) => ({ tagName, tagType: 'experience' })),
              },
            },
          });

          await tx.adminOperationLog.create({
            data: {
              adminUserId: adminUser?.id ?? null,
              action: 'event.import.update',
              targetType: 'events',
              targetId: updated.id,
              beforeValue: {
                eventName: existing.eventName,
                city: existing.city,
                publishStatus: existing.publishStatus,
              },
              afterValue: { eventName: updated.eventName, city: updated.city },
              note: 'CSV 导入更新真实赛事数据',
            },
          });

          return { status: 'updated' as const };
        }

        const created = await tx.event.create({
          data: {
            ...baseData,
            publishStatus: 'draft',
            checklistItems: {
              create: defaultChecklist.map(([groupName, itemName, itemStatus], checklistIndex) => ({
                groupName,
                itemName,
                itemStatus,
                sortOrder: checklistIndex + 1,
              })),
            },
            eventTags: {
              create: tags.map((tagName) => ({ tagName, tagType: 'experience' })),
            },
          },
        });

        await tx.adminOperationLog.create({
          data: {
            adminUserId: adminUser?.id ?? null,
            action: 'event.import.create',
            targetType: 'events',
            targetId: created.id,
            afterValue: { eventName: created.eventName, city: created.city, publishStatus: created.publishStatus },
            note: 'CSV 导入创建真实赛事数据',
          },
        });

        return { status: 'created' as const };
      });

      if (saved.status === 'created') result.created += 1;
      if (saved.status === 'updated') result.updated += 1;
    } catch (error) {
      result.failed += 1;
      failures.push({ line, reason: (error as Error).message || '数据库写入失败' });
    }
  }

  console.log('导入完成：');
  console.log(`- 新增：${result.created} 条`);
  console.log(`- 更新：${result.updated} 条`);
  console.log(`- 跳过：${result.skipped} 条`);
  console.log(`- 失败：${result.failed} 条`);

  for (const failure of failures) {
    console.log(`第 ${failure.line} 行失败：${failure.reason}`);
  }
}

function parseCsv(content: string) {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((item) => item.some((value) => value.trim()));
}

function isExpectedHeader(row: string[]) {
  return headers.length === row.length && headers.every((header, index) => row[index]?.trim() === header);
}

function validateRow(row: Row) {
  const errors: string[] = [];
  const required: Header[] = [
    'eventName',
    'city',
    'eventDate',
    'distanceItems',
    'signupStatus',
    'officialUrl',
    'sourceName',
    'sourceLevel',
    'runJudgement',
    'judgementSummary',
  ];

  for (const field of required) {
    if (!row[field]) errors.push(`${field} 不能为空`);
  }

  if (row.eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(row.eventDate)) errors.push('eventDate 必须是 YYYY-MM-DD');
  if (row.eventDate && Number.isNaN(parseDateOnly(row.eventDate).getTime())) errors.push('eventDate 无效');
  if (row.officialUrl && !isValidUrl(row.officialUrl)) errors.push('officialUrl 必须是合法 URL');
  if (row.officialUrl && row.officialUrl.includes('example.com')) {
    errors.push('officialUrl 不能包含 example.com');
  }
  if (row.sourceUrl && !isValidUrl(row.sourceUrl)) errors.push('sourceUrl 必须是合法 URL');
  if (row.signupDeadline && Number.isNaN(new Date(row.signupDeadline).getTime())) {
    errors.push('signupDeadline 必须是合法日期时间或留空');
  }
  if (row.signupStatus && !signupStatusValues.has(row.signupStatus as SignupStatus)) {
    errors.push(`signupStatus 必须是：${Array.from(signupStatusValues).join('|')}`);
  }
  if (row.sourceLevel && !sourceLevelValues.has(row.sourceLevel as SourceLevel)) {
    errors.push(`sourceLevel 必须是：${Array.from(sourceLevelValues).join('|')}`);
  }
  if (row.runJudgement && !runJudgementValues.has(row.runJudgement as RunJudgement)) {
    errors.push(`runJudgement 必须是：${Array.from(runJudgementValues).join('|')}`);
  }

  return errors;
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function splitList(value: string) {
  return value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

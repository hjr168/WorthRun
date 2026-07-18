import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prisma } from '@worth-running/database';
import { buildPublicEventWhere } from './dataPolicy.js';
import { createSourceSummaryDraft } from './sourceSummaryWorkflow.js';

export function parseSourceSummaryBackfillArgs(args: string[]) {
  const apply = args.includes('--apply');
  const expectedText = readArg(args, '--expected');
  const expected = expectedText === undefined ? undefined : Number(expectedText);
  if (apply && (!Number.isInteger(expected) || Number(expected) < 0)) {
    throw new Error('--apply 必须同时提供整数 --expected');
  }
  return { dryRun: !apply, expected };
}

export async function runSourceSummaryBackfill(options: { dryRun: boolean; expected?: number }) {
  const events = await prisma.event.findMany({
    where: {
      ...buildPublicEventWhere(),
      sourceLevel: { in: ['official', 'trusted'] },
      sourceSummaries: { none: { status: { in: ['draft', 'published'] } } },
    },
    select: { id: true, eventName: true, sourceName: true },
    orderBy: { eventDate: 'asc' },
  });
  const preview = {
    dryRun: options.dryRun,
    count: events.length,
    samples: events.slice(0, 8),
  };
  if (options.dryRun) return { ...preview, created: [], failed: [] };
  if (options.expected !== events.length) {
    throw new Error(`预期数量不一致：expected=${options.expected}，当前=${events.length}`);
  }

  const created: Array<{ eventId: string; summaryId: string }> = [];
  const failed: Array<{ eventId: string; message: string }> = [];
  for (const event of events) {
    try {
      const summary = await createSourceSummaryDraft(event.id);
      created.push({ eventId: event.id, summaryId: summary.id });
    } catch (error) {
      failed.push({
        eventId: event.id,
        message: error instanceof Error ? error.message : '生成失败',
      });
    }
  }
  await prisma.adminOperationLog.create({
    data: {
      action: 'source_summary.backfill_drafts',
      targetType: 'event_source_summaries',
      afterValue: { expected: events.length, created, failed },
      note: `顺序生成来源摘要草稿：成功 ${created.length}，失败 ${failed.length}`,
    },
  });
  return { ...preview, created, failed };
}

export async function main(args = process.argv.slice(2)) {
  const result = await runSourceSummaryBackfill(parseSourceSummaryBackfillArgs(args));
  console.log(JSON.stringify(result, null, 2));
  if (result.dryRun) console.log(`\nApply with: --apply --expected ${result.count}`);
}

function readArg(args: string[], name: string) {
  const inline = args.find((item) => item.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function isMainModule() {
  const entry = process.argv[1];
  return Boolean(entry && pathToFileURL(resolve(entry)).href === import.meta.url);
}

if (isMainModule()) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}

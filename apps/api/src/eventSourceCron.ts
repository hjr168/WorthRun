import { readFileSync } from 'node:fs';
import { freemem } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prisma } from '@worth-running/database';
import { runEventSource } from './ai/runEventSource.js';

const DEFAULT_MIN_AVAILABLE_MB = 256;
const MIN_ALLOWED_THRESHOLD_MB = 128;
const MAX_ALLOWED_THRESHOLD_MB = 512;

interface DueSourceOptions {
  now: Date;
  findFirst?: (args: unknown) => Promise<{ id: string } | null>;
  runner?: typeof runEventSource;
}

export async function runNextDueEventSource(options: DueSourceOptions) {
  const findFirst = options.findFirst ?? prisma.eventSource.findFirst.bind(prisma.eventSource);
  const runner = options.runner ?? runEventSource;
  const source = await findFirst({
    where: { status: 'active', scheduleEnabled: true, nextRunAt: { lte: options.now } },
    orderBy: { nextRunAt: 'asc' },
    select: { id: true },
  });
  if (!source) return null;
  return runner(source.id, { trigger: 'scheduled' });
}

export function readLinuxMemAvailable(meminfo?: string) {
  let text = meminfo;
  if (text === undefined && process.platform === 'linux') {
    try {
      text = readFileSync('/proc/meminfo', 'utf8');
    } catch {
      text = undefined;
    }
  }
  if (text) {
    const match = text.match(/^MemAvailable:\s+(\d+)\s+kB$/m);
    if (match) return Number(match[1]) / 1024;
  }
  return freemem() / 1024 / 1024;
}

export function hasMemoryBudget(availableMb: number, configuredThreshold?: string) {
  const parsed = Number(configuredThreshold);
  const requested = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MIN_AVAILABLE_MB;
  const threshold = Math.min(
    Math.max(requested, MIN_ALLOWED_THRESHOLD_MB),
    MAX_ALLOWED_THRESHOLD_MB,
  );
  return availableMb >= threshold;
}

export async function main() {
  const availableMb = readLinuxMemAvailable();
  const rssBeforeMb = process.memoryUsage().rss / 1024 / 1024;
  if (!hasMemoryBudget(availableMb, process.env.EVENT_SOURCE_MIN_AVAILABLE_MB)) {
    console.log(
      JSON.stringify({
        event: 'event_source_cron_skipped',
        reason: 'low_memory',
        availableMb: Math.round(availableMb),
        rssMb: Math.round(rssBeforeMb),
      }),
    );
    return;
  }

  const result = await runNextDueEventSource({ now: new Date() });
  console.log(
    JSON.stringify({
      event: result ? 'event_source_cron_completed' : 'event_source_cron_idle',
      runId: result?.runId,
      sourceId: result?.sourceId,
      fetched: result?.fetched,
      created: result?.created,
      updated: result?.updated,
      skippedExpired: result?.skippedExpired,
      skippedOutsideRegion: result?.skippedOutsideRegion,
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    }),
  );
}

function isMainModule() {
  const entry = process.argv[1];
  return Boolean(entry && pathToFileURL(resolve(entry)).href === import.meta.url);
}

if (isMainModule()) {
  main()
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'event source cron failed';
      console.error(JSON.stringify({ event: 'event_source_cron_failed', message }));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

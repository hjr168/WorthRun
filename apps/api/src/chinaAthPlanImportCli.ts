import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prisma } from '@worth-running/database';
import { runChinaAthPlanImport } from './chinaAthPlanImport.js';

export function parseChinaAthPlanImportArgs(args: string[]) {
  const apply = args.includes('--apply');
  const year = Number(readArg(args, '--year') || '2026');
  const expectedValue = readArg(args, '--expected');
  const expected = expectedValue === undefined ? undefined : Number(expectedValue);
  if (!Number.isInteger(year)) throw new Error('--year 必须是整数');
  if (apply && (!Number.isInteger(expected) || Number(expected) < 0)) {
    throw new Error('--apply 必须同时提供整数 --expected');
  }
  return { year, dryRun: !apply, expected };
}

export async function main(args = process.argv.slice(2)) {
  const options = parseChinaAthPlanImportArgs(args);
  const result = await runChinaAthPlanImport(options);
  console.log(JSON.stringify(result, null, 2));
  if (options.dryRun) {
    console.log(`\nApply with: --year ${options.year} --apply --expected ${result.expected}`);
  }
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

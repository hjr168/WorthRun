import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prisma } from '@worth-running/database';
import { runCandidateConfirmationBackfill } from './candidateConfirmationBackfill.js';

export function parseCandidateConfirmationBackfillArgs(args: string[]) {
  const apply = args.includes('--apply');
  const expectedText = readArg(args, '--expected');
  const expected = expectedText === undefined ? undefined : Number(expectedText);
  if (apply && (!Number.isInteger(expected) || Number(expected) < 0)) {
    throw new Error('--apply 必须同时提供整数 --expected');
  }
  return { dryRun: !apply, expected };
}

export async function main(args = process.argv.slice(2)) {
  const result = await runCandidateConfirmationBackfill(
    parseCandidateConfirmationBackfillArgs(args),
  );
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

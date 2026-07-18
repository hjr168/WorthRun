import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prisma } from '@worth-running/database';
import { bootstrapV042EventSources } from './eventSourceBootstrap.js';

export async function main(args = process.argv.slice(2)) {
  const result = await bootstrapV042EventSources({ dryRun: !args.includes('--apply') });
  console.log(JSON.stringify(result, null, 2));
  if (result.dryRun) console.log('\nApply with: --apply');
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

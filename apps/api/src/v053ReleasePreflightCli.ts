import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '@worth-running/database';
import {
  evaluateV053Database,
  evaluateV053Environment,
  evaluateV053Repository,
  type PreflightCheck,
  type PreflightPhase,
} from './v053ReleasePreflight.js';

function option(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

const phase = (option('phase') || 'foundation') as PreflightPhase;
if (!['foundation', 'users', 'reminders'].includes(phase)) {
  process.stderr.write('phase 必须是 foundation、users 或 reminders\n');
  process.exit(2);
}
const skipDatabase = process.argv.includes('--skip-database');
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const checks: PreflightCheck[] = [
  ...evaluateV053Environment(process.env, phase),
  ...evaluateV053Repository({ repoRoot, env: process.env, phase }),
];

try {
  if (!skipDatabase) checks.push(...(await evaluateV053Database()));
} catch {
  checks.push({
    id: 'database_connection',
    status: 'blocker',
    message: '无法连接数据库或读取迁移状态',
  });
} finally {
  await prisma.$disconnect();
}

for (const item of checks) {
  const marker = item.status === 'pass' ? 'PASS' : item.status === 'warning' ? 'WARN' : 'BLOCK';
  process.stdout.write(`[${marker}] ${item.id}: ${item.message}\n`);
}
const blockers = checks.filter((item) => item.status === 'blocker');
process.stdout.write(
  `${JSON.stringify({ phase, checks: checks.length, blockers: blockers.length })}\n`,
);
if (blockers.length) process.exitCode = 1;

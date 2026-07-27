import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '@worth-running/database';
import {
  evaluateV053Database,
  evaluateV053Environment,
  evaluateV053Repository,
  evaluateV053WechatTemplates,
  fetchV053WechatTemplates,
  type PreflightCheck,
  type PreflightMode,
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
const mode = (option('mode') || 'live') as PreflightMode;
if (!['ready', 'live'].includes(mode)) {
  process.stderr.write('mode 必须是 ready 或 live\n');
  process.exit(2);
}
const skipDatabase = process.argv.includes('--skip-database');
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const checks: PreflightCheck[] = [
  ...evaluateV053Environment(process.env, phase, mode),
  ...evaluateV053Repository({ repoRoot, env: process.env, phase }),
];

try {
  if (phase === 'reminders') {
    const templates = await fetchV053WechatTemplates(process.env);
    checks.push(...evaluateV053WechatTemplates(process.env, templates));
  }
  if (!skipDatabase) checks.push(...(await evaluateV053Database(phase)));
} catch (error) {
  checks.push({
    id: phase === 'reminders' ? 'external_readiness' : 'database_connection',
    status: 'blocker',
    message:
      phase === 'reminders'
        ? `无法完成微信模板或数据库检查：${error instanceof Error ? error.message : '未知错误'}`
        : '无法连接数据库或读取迁移状态',
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
  `${JSON.stringify({ phase, mode, checks: checks.length, blockers: blockers.length })}\n`,
);
if (blockers.length) process.exitCode = 1;

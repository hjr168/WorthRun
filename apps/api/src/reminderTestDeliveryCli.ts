import { prisma } from '@worth-running/database';
import { deliverDueReminders } from './reminderDelivery.js';

function option(name: string) {
  const prefix = `--${name}=`;
  return process.argv
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length)
    .trim();
}

const userId = option('user-id');
const eventId = option('event-id');
const reminderType = option('type');
const apply = process.argv.includes('--apply');

if (!userId || !eventId || !['signup', 'race_week'].includes(reminderType || '')) {
  process.stderr.write('必须提供 --user-id、--event-id 和 --type=signup|race_week\n');
  process.exit(2);
}
if (!apply) {
  process.stderr.write('测试发送必须显式携带 --apply\n');
  process.exit(2);
}

try {
  const reminder = await prisma.eventReminder.findUnique({
    where: {
      userId_eventId_reminderType: {
        userId,
        eventId,
        reminderType: reminderType as 'signup' | 'race_week',
      },
    },
    select: { id: true, status: true },
  });
  if (!reminder || reminder.status !== 'pending') {
    throw new Error('指定测试账号没有可发送的待处理提醒');
  }
  const result = await deliverDueReminders({
    dryRun: false,
    testReminderId: reminder.id,
    limit: 1,
  });
  process.stdout.write(`${JSON.stringify({ mode: 'trial-test', ...result })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

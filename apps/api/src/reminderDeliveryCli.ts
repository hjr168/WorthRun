import { prisma } from '@worth-running/database';
import { deliverDueReminders } from './reminderDelivery.js';

const dryRun = !process.argv.includes('--apply');

deliverDueReminders({ dryRun })
  .then((result) => {
    console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'apply', ...result }, null, 2));
  })
  .finally(() => prisma.$disconnect());

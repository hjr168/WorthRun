import { prisma } from '@worth-running/database';
import { runFeedbackMaintenance } from './feedbackMaintenance.js';

try {
  const result = await runFeedbackMaintenance();
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

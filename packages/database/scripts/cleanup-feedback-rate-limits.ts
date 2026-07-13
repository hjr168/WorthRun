import { prisma } from '../src/index.js';

async function main() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const result = await prisma.feedbackRateLimit.deleteMany({
    where: { windowStart: { lt: cutoff } },
  });
  console.log(`已清理 ${result.count} 条过期反馈限流记录`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

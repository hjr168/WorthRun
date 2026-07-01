import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { prisma } from '@worth-running/database';

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$100000$${salt}$${hash}`;
}

async function main() {
  const args = process.argv.slice(2);
  const [username, newPassword] = args[0] === '--' ? args.slice(1) : args;

  if (!username || !newPassword) {
    console.error('用法：pnpm admin:reset-password -- <username> <new-password>');
    process.exit(1);
  }

  const admin = await prisma.adminUser.findUnique({
    where: { username },
    select: { id: true, username: true },
  });

  if (!admin) {
    console.error(`未找到管理员用户：${username}`);
    process.exit(1);
  }

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash: hashPassword(newPassword), updatedAt: new Date() },
  });

  console.log(`管理员 ${admin.username} 的密码已更新。`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : '重置管理员密码失败');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

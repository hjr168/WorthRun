import { randomUUID } from 'node:crypto';
import { prisma } from '@worth-running/database';

const LEASE_DURATION_MS = 30 * 60 * 1000;

interface LeaseStore {
  updateMany(args: unknown): Promise<{ count: number }>;
}

interface AcquireLeaseDependencies {
  updateMany?: LeaseStore['updateMany'];
  createToken?: () => string;
}

export async function acquireEventSourceLease(
  sourceId: string,
  now: Date,
  dependencies: AcquireLeaseDependencies = {},
) {
  const updateMany = dependencies.updateMany ?? prisma.eventSource.updateMany.bind(prisma.eventSource);
  const token = (dependencies.createToken ?? randomUUID)();
  const expiresAt = new Date(now.getTime() + LEASE_DURATION_MS);
  const result = await updateMany({
    where: {
      id: sourceId,
      OR: [{ runLockToken: null }, { runLockExpiresAt: null }, { runLockExpiresAt: { lte: now } }],
    },
    data: { runLockToken: token, runLockExpiresAt: expiresAt },
  });

  return result.count === 1 ? { token, expiresAt } : null;
}

export async function releaseEventSourceLease(
  sourceId: string,
  token: string,
  dependencies: Pick<AcquireLeaseDependencies, 'updateMany'> = {},
) {
  const updateMany = dependencies.updateMany ?? prisma.eventSource.updateMany.bind(prisma.eventSource);
  await updateMany({
    where: { id: sourceId, runLockToken: token },
    data: { runLockToken: null, runLockExpiresAt: null },
  });
}

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createUserToken,
  decryptOpenId,
  encryptOpenId,
  linkAnonymousData,
  maskOpenId,
  parseUserToken,
  secretKey,
} from './userIdentity.js';

describe('user identity security', () => {
  const key = secretKey(Buffer.alloc(32, 7).toString('base64'));

  it('encrypts and decrypts openid without storing plaintext', () => {
    const encrypted = encryptOpenId('oWechat-user-123456', key);
    expect(encrypted.ciphertext).not.toContain('oWechat');
    expect(decryptOpenId(encrypted, key)).toBe('oWechat-user-123456');
  });

  it('masks openid for admin lists', () => {
    expect(maskOpenId('oWechat-user-123456')).toBe('oWec****3456');
  });

  it('rejects expired or tampered user tokens', () => {
    const token = createUserToken('user-1', 'secret', 1_000);
    expect(parseUserToken(token, 'secret', 2_000).userId).toBe('user-1');
    expect(() => parseUserToken(`${token}x`, 'secret', 2_000)).toThrow();
    expect(() => parseUserToken(token, 'secret', 31 * 24 * 60 * 60 * 1_000)).toThrow();
  });

  it('rejects malformed signed payloads as an authentication error', () => {
    const payload = Buffer.from('not-json').toString('base64url');
    const signature = createHmac('sha256', 'secret').update(payload).digest('base64url');
    expect(() => parseUserToken(`${payload}.${signature}`, 'secret')).toThrow(
      expect.objectContaining({ status: 401 }),
    );
  });

  it('keeps records already linked to the same user on repeated login', async () => {
    let favoriteDeletes = 0;
    let choiceDeletes = 0;
    const tx = {
      userAlias: {
        findUnique: async () => ({ userId: 'user-1' }),
        upsert: async () => ({}),
      },
      userPreference: { findUnique: async () => null },
      userFavorite: {
        findMany: async () => [
          { id: 'favorite-1', userId: 'user-1', eventId: 'event-1', createdAt: new Date() },
        ],
        findFirst: async () => null,
        update: async () => ({}),
        delete: async () => {
          favoriteDeletes += 1;
        },
      },
      userEventChoice: {
        findMany: async () => [
          { id: 'choice-1', userId: 'user-1', eventId: 'event-1', updatedAt: new Date() },
        ],
        findFirst: async () => null,
        update: async () => ({}),
        delete: async () => {
          choiceDeletes += 1;
        },
      },
      feedback: { updateMany: async () => ({ count: 0 }) },
      shareRecord: { updateMany: async () => ({ count: 0 }) },
    };
    await linkAnonymousData(tx as never, 'user-1', 'device-1', 'alias-hash');
    expect(favoriteDeletes).toBe(0);
    expect(choiceDeletes).toBe(0);
  });
});

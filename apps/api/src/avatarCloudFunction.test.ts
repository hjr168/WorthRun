import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { detectImageMime } = require(
  '../../../uniCloud-alipay/cloudfunctions/worthrun-avatar/imageMime.js',
) as { detectImageMime(buffer: Buffer): string | null };

describe('avatar cloud function image detection', () => {
  it.each([
    ['JPEG', Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg'],
    ['PNG', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'],
    ['WebP', Buffer.from('RIFF1234WEBP', 'ascii'), 'image/webp'],
  ])('detects %s from bytes without relying on multipart MIME', (_, bytes, expected) => {
    expect(detectImageMime(bytes)).toBe(expected);
  });

  it('rejects unsupported file content', () => {
    expect(detectImageMime(Buffer.from('not an image'))).toBeNull();
  });
});

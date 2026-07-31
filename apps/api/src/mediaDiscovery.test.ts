import { describe, expect, it, vi } from 'vitest';
import {
  assertSafeImageUrl,
  assertSafeImageUrlResolved,
  extractImageCandidates,
  imageMagicMime,
  isPrivateAddress,
  mediaSha256,
  validateImagePayload,
} from './mediaDiscovery.js';

describe('media discovery security', () => {
  it('blocks private IPs and non-confirmed hosts', () => {
    expect(() => assertSafeImageUrl('http://127.0.0.1/image.jpg')).toThrow('HTTPS');
    expect(() => assertSafeImageUrl('https://cdn.example.com/image.jpg', ['official.example.com'])).toThrow('域名');
  });

  it('extracts explicit and ordinary event images while excluding unsupported icons', () => {
    const html = '<meta property="og:image" content="/hero.jpg"><script type="application/ld+json">{"image":["https://official.example.com/structured.webp",{"url":"https://official.example.com/structured-2.webp"}]}</script><header><img src="/logo.png"><img class="race_banner" src="/race.jpg"><img src="/checkmark.svg"></header><main><img src="photo.png"></main>';
    expect(extractImageCandidates(html, 'https://official.example.com/race')).toEqual([
      'https://official.example.com/hero.jpg',
      'https://official.example.com/structured.webp',
      'https://official.example.com/structured-2.webp',
      'https://official.example.com/race.jpg',
      'https://official.example.com/photo.png',
      'https://official.example.com/logo.png',
    ]);
  });

  it('requires magic bytes, MIME agreement and hashes duplicate bytes', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    expect(imageMagicMime(jpeg)).toBe('image/jpeg');
    expect(validateImagePayload({ buffer: jpeg, contentType: 'image/jpeg' })).toBe('image/jpeg');
    expect(validateImagePayload({ buffer: jpeg, contentType: 'image/jpeg; charset=binary' })).toBe('image/jpeg');
    expect(() => validateImagePayload({ buffer: jpeg, contentType: 'image/png' })).toThrow('MIME');
    expect(mediaSha256(jpeg)).toHaveLength(64);
  });

  it('blocks private, reserved and mapped DNS answers', async () => {
    expect(isPrivateAddress('0.0.0.0')).toBe(true);
    expect(isPrivateAddress('100.64.0.1')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('fc00::1')).toBe(true);
    expect(isPrivateAddress('::ffff:192.168.1.10')).toBe(true);
    await expect(assertSafeImageUrlResolved('https://official.example/image.jpg', ['official.example'], async () => [{ address: '127.0.0.1', family: 4 }])).rejects.toThrow('解析结果');
    await expect(assertSafeImageUrlResolved('https://official.example/image.jpg', ['official.example'], async () => [{ address: '2001:db8::1', family: 6 }])).rejects.toThrow('解析结果');
  });

  it('rechecks each redirect target through the DNS guard', async () => {
    const lookup = vi.fn()
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    await expect(assertSafeImageUrlResolved('https://official.example/image.jpg', ['official.example'], lookup)).resolves.toMatchObject({ url: expect.any(URL) });
    await expect(assertSafeImageUrlResolved('https://cdn.official.example/image.jpg', ['official.example'], lookup)).rejects.toThrow('解析结果');
  });
});

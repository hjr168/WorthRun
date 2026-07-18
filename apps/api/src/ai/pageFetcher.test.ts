import { describe, expect, it, vi } from 'vitest';
import {
  detectFetchBlockReason,
  fetchRobotsAllowedPage,
  normalizeAllowedDomains,
  readResponseTextLimited,
  shouldAllowUrl,
} from './pageFetcher.js';

describe('pageFetcher guards', () => {
  it('normalizes allowed domains', () => {
    expect(normalizeAllowedDomains(['https://example.com', 'www.race.org/'])).toEqual([
      'example.com',
      'www.race.org',
    ]);
  });

  it('blocks domains outside the allowlist', () => {
    expect(shouldAllowUrl('https://official.example/race', ['official.example'])).toBe(true);
    expect(shouldAllowUrl('https://unknown.example/race', ['official.example'])).toBe(false);
  });

  it('detects Tencent EdgeOne challenge responses', () => {
    const reason = detectFetchBlockReason({
      status: 567,
      server: 'TencentEdgeOne',
      body: '<!doctype html><html><title></title><style>.a1{}</style></html>',
    });

    expect(reason).toContain('腾讯 EdgeOne');
  });

  it('cancels a response stream as soon as the byte limit is reached', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const releaseLock = vi.fn();
    const read = vi.fn().mockResolvedValueOnce({
      done: false,
      value: new TextEncoder().encode('abcdefgh'),
    });
    const response = {
      body: { getReader: () => ({ read, cancel, releaseLock }) },
    } as unknown as Response;

    await expect(readResponseTextLimited(response, 4)).resolves.toBe('abcd');
    expect(cancel).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it('limits extracted page text and applies request timeouts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(`<html><body>${'x'.repeat(35_000)}</body></html>`, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    try {
      const result = await fetchRobotsAllowedPage('https://official.example/race', [
        'official.example',
      ]);

      expect(result.text).toHaveLength(30_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
      expect(fetchMock.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

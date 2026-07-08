import { describe, expect, it } from 'vitest';
import {
  detectFetchBlockReason,
  normalizeAllowedDomains,
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
});

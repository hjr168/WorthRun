import { describe, expect, it } from 'vitest';
import { normalizeAllowedDomains, shouldAllowUrl } from './pageFetcher.js';

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
});

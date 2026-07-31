import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildMediaDerivative } = require('./mediaDerivative.js');

describe('CloudBase media derivative fallback', () => {
  it('keeps the source format and real dimensions when sharp is unavailable', () => {
    expect(buildMediaDerivative({ mimeType: 'image/png', dimensions: { width: 1200, height: 800 }, sharpAvailable: false, width: 1600, height: 900 })).toEqual({ mimeType: 'image/png', extension: 'png', width: 1200, height: 800 });
  });

  it('reports the promised JPEG dimensions only after conversion', () => {
    expect(buildMediaDerivative({ mimeType: 'image/webp', dimensions: { width: 1200, height: 800 }, sharpAvailable: true, width: 1600, height: 900 })).toEqual({ mimeType: 'image/jpeg', extension: 'jpg', width: 1600, height: 900 });
  });
});

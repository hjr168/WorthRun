import { describe, expect, it } from 'vitest';
import { productFeedbackUrl, resolveMiniappVersion } from './product-feedback';

describe('product feedback navigation', () => {
  it('uses fixed page context and optional server request id', () => {
    expect(productFeedbackUrl('event_detail')).toBe(
      '/pages/product-feedback/index?contextPage=event_detail',
    );
    expect(productFeedbackUrl('source_summary', 'request-id')).toContain(
      'relatedRequestId=request-id',
    );
  });

  it('uses the runtime environment when WeChat does not expose a version number', () => {
    expect(resolveMiniappVersion({ version: '1.2.3', envVersion: 'trial' })).toBe('1.2.3');
    expect(resolveMiniappVersion({ version: '', envVersion: 'trial' })).toBe('trial');
    expect(resolveMiniappVersion({ envVersion: 'develop' })).toBe('develop');
    expect(resolveMiniappVersion({ envVersion: 'unknown' })).toBeUndefined();
  });
});

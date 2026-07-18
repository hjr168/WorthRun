import { describe, expect, it } from 'vitest';
import { productFeedbackUrl } from './product-feedback';

describe('product feedback navigation', () => {
  it('uses fixed page context and optional server request id', () => {
    expect(productFeedbackUrl('event_detail')).toBe(
      '/pages/product-feedback/index?contextPage=event_detail',
    );
    expect(productFeedbackUrl('source_summary', 'request-id')).toContain(
      'relatedRequestId=request-id',
    );
  });
});

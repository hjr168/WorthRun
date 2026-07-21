import { describe, expect, it } from 'vitest';
import {
  canSubmitProductFeedback,
  productFeedbackUrl,
  resolveMiniappVersion,
  resolveProductFeedbackContext,
} from './product-feedback';

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

  it('preserves an automatically supplied custom page and selects custom mode', () => {
    expect(resolveProductFeedbackContext(' 配速计算器 ')).toEqual({
      contextPage: 'mine',
      customContextPage: '配速计算器',
      isCustomContext: true,
    });
    expect(resolveProductFeedbackContext('choices')).toEqual({
      contextPage: 'choices',
      customContextPage: '',
      isCustomContext: false,
    });
  });

  it('requires a page name when custom mode is selected', () => {
    expect(canSubmitProductFeedback(6, false, '')).toBe(true);
    expect(canSubmitProductFeedback(6, true, '')).toBe(false);
    expect(canSubmitProductFeedback(6, true, '配速计算器')).toBe(true);
  });
});

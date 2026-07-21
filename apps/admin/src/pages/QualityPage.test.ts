import { describe, expect, it } from 'vitest';
import { formatFeedbackAppVersion, formatFeedbackContextPage } from './QualityPage';

describe('feedback context display', () => {
  it('keeps known labels and displays custom page names as submitted', () => {
    expect(formatFeedbackContextPage('mine')).toBe('我的');
    expect(formatFeedbackContextPage('测试')).toBe('测试');
    expect(formatFeedbackContextPage('  配速计算器  ')).toBe('配速计算器');
    expect(formatFeedbackContextPage(null)).toBe('未标记页面');
  });

  it('distinguishes an unreported version from a submitted version', () => {
    expect(formatFeedbackAppVersion('1.2.3')).toBe('版本 1.2.3');
    expect(formatFeedbackAppVersion('trial')).toBe('版本 trial');
    expect(formatFeedbackAppVersion(undefined)).toBe('版本未上报');
  });
});

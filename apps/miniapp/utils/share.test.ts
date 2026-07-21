import { describe, expect, it } from 'vitest';
import { resolveShareTitle } from './share';

describe('miniapp share title', () => {
  it('resolves event variables', () => {
    expect(resolveShareTitle('这场值得跑吗？{eventName}', { eventName: '深圳马拉松' })).toBe(
      '这场值得跑吗？深圳马拉松',
    );
  });
  it('truncates long titles', () => expect(resolveShareTitle('跑'.repeat(50))).toHaveLength(40));
});

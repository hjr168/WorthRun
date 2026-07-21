import { describe, expect, it } from 'vitest';
import {
  defaultShareSettings,
  findUnknownShareVariables,
  mergeShareSettings,
  isAllowedShareImageUrl,
  resolveShareSetting,
  resolveShareTitle,
} from './share.js';

describe('share settings', () => {
  it('replaces allowed variables and removes missing variables', () => {
    expect(
      resolveShareTitle('这场值得跑吗？{eventName} · {city}', { eventName: '深圳马拉松' }),
    ).toBe('这场值得跑吗？深圳马拉松 ·');
  });

  it('truncates resolved titles to forty characters', () => {
    expect(resolveShareTitle('{eventName}', { eventName: '赛'.repeat(60) })).toHaveLength(40);
    expect(resolveShareTitle('{eventName}', { eventName: '赛'.repeat(60) }).endsWith('…')).toBe(
      true,
    );
  });

  it('detects unknown variables', () => {
    expect(findUnknownShareVariables('{eventName}-{unknown}-{unknown}')).toEqual(['unknown']);
  });

  it('allows built-in images and allowlisted HTTPS hosts only', () => {
    expect(isAllowedShareImageUrl('/assets/share/share-brand.jpg', [])).toBe(true);
    expect(isAllowedShareImageUrl('https://cdn.example.com/share.jpg', ['cdn.example.com'])).toBe(
      true,
    );
    expect(isAllowedShareImageUrl('http://cdn.example.com/share.jpg', ['cdn.example.com'])).toBe(
      false,
    );
    expect(isAllowedShareImageUrl('https://other.example.com/share.jpg', ['cdn.example.com'])).toBe(
      false,
    );
  });

  it('merges partial settings and event overrides with stable fallbacks', () => {
    const settings = mergeShareSettings(
      {
        scenes: { home: { titleTemplate: '自定义首页', imageUrl: '' } },
      },
      'revision-2',
    );
    expect(settings.scenes.home.imageUrl).toBe(defaultShareSettings.scenes.home.imageUrl);
    expect(
      resolveShareSetting(
        settings,
        'event_detail',
        { eventName: '广州马拉松' },
        {
          titleTemplate: '一起跑 {eventName}',
        },
      ),
    ).toEqual({
      title: '一起跑 广州马拉松',
      imageUrl: defaultShareSettings.scenes.event_detail.imageUrl,
    });
  });
});

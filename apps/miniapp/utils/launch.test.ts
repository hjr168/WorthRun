import { describe, expect, it } from 'vitest';
import { resolveEventId, resolveMiniProgramEnvVersion } from './launch';

describe('resolveEventId', () => {
  it('读取普通页面分享的 id', () => {
    expect(resolveEventId({ id: 'cm-event-1' })).toBe('cm-event-1');
  });

  it('读取海报小程序码的 scene', () => {
    expect(resolveEventId({ scene: 'id=cm-event-2' })).toBe('cm-event-2');
  });

  it('兼容微信传入的编码 scene', () => {
    expect(resolveEventId({ scene: 'id%3Dcm-event-3' })).toBe('cm-event-3');
  });

  it('优先使用明确的 id 参数', () => {
    expect(resolveEventId({ id: 'direct-event', scene: 'id=poster-event' })).toBe('direct-event');
  });
});

describe('resolveMiniProgramEnvVersion', () => {
  it.each(['develop', 'trial', 'release'] as const)('保留当前小程序环境 %s', (envVersion) => {
    expect(resolveMiniProgramEnvVersion(envVersion)).toBe(envVersion);
  });

  it('未知环境安全回退到正式版', () => {
    expect(resolveMiniProgramEnvVersion('unknown')).toBe('release');
  });
});

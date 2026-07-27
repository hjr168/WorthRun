import { describe, expect, it } from 'vitest';
import { getSubscribeMessageError } from './reminder-permission';

describe('getSubscribeMessageError', () => {
  it('explains a lost user gesture', () => {
    expect(
      getSubscribeMessageError({
        errMsg: 'requestSubscribeMessage:fail can only be invoked by user TAP gesture.',
      }),
    ).toBe('请再次点击开启提醒');
  });

  it('explains disabled subscription settings', () => {
    expect(
      getSubscribeMessageError({
        errMsg: 'requestSubscribeMessage:fail main switch is switched off',
      }),
    ).toBe('请在微信设置中开启订阅消息');
  });

  it('does not expose unknown platform errors', () => {
    expect(getSubscribeMessageError({ errMsg: 'requestSubscribeMessage:fail internal error' })).toBe(
      '微信订阅授权未完成，请稍后重试',
    );
  });

  it('explains an invalid template without exposing its id', () => {
    expect(
      getSubscribeMessageError({
        errMsg: 'requestSubscribeMessage:fail template id does not exist',
      }),
    ).toBe('提醒模板配置异常，请稍后再试');
  });
});

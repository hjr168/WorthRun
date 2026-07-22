import { request, UserProfile } from './api';
import { getUserKey } from './user';
import {
  clearUserSession,
  getCachedUserProfile,
  hasValidUserToken,
  isAutoRegisterPaused,
  saveUserSession,
} from './user-session';

let loginPromise: Promise<UserProfile | null> | null = null;

function wxLogin() {
  return new Promise<string>((resolve, reject) => {
    wx.login({
      success: (result) => {
        if (result.code) resolve(result.code);
        else reject(new Error('微信登录失败'));
      },
      fail: reject,
    });
  });
}

export function ensureWechatSession(force = false): Promise<UserProfile | null> {
  if (!force && isAutoRegisterPaused()) return Promise.resolve(null);
  if (!force && hasValidUserToken() && getCachedUserProfile()) {
    return Promise.resolve(getCachedUserProfile());
  }
  if (loginPromise) return loginPromise;
  const pending = wxLogin()
    .then((code) =>
      request<{ token: string; expiresAt: string; user: UserProfile }>('/api/auth/wechat', {
        method: 'POST',
        data: { code, userKey: getUserKey() },
        silent: true,
      }),
    )
    .then((result) => {
      saveUserSession(result.token, result.user, result.expiresAt);
      return result.user;
    })
    .catch((): UserProfile | null => {
      clearUserSession();
      return null;
    })
    .then((result) => {
      loginPromise = null;
      return result;
    });
  loginPromise = pending;
  return pending;
}

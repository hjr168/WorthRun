const USER_TOKEN_KEY = 'worthrun_user_token';
const USER_PROFILE_KEY = 'worthrun_user_profile';
const USER_TOKEN_EXPIRES_KEY = 'worthrun_user_token_expires';
export const AUTO_REGISTER_PAUSED_KEY = 'worthrun_auto_register_paused';

export interface UserProfile {
  id: string;
  nickname: string | null;
  avatarFileId: string | null;
  avatarUrl?: string | null;
  status: 'active' | 'disabled';
  registeredAt: string;
  lastActiveAt: string;
}

export function getUserToken() {
  return String(wx.getStorageSync(USER_TOKEN_KEY) || '');
}

export function saveUserSession(token: string, profile: UserProfile, expiresAt: string) {
  wx.setStorageSync(USER_TOKEN_KEY, token);
  wx.setStorageSync(USER_PROFILE_KEY, profile);
  wx.setStorageSync(USER_TOKEN_EXPIRES_KEY, expiresAt);
}

export function getCachedUserProfile() {
  return (wx.getStorageSync(USER_PROFILE_KEY) || null) as UserProfile | null;
}

export function updateCachedUserProfile(profile: UserProfile | null) {
  if (profile) wx.setStorageSync(USER_PROFILE_KEY, profile);
  else wx.removeStorageSync(USER_PROFILE_KEY);
}

export function clearUserSession() {
  wx.removeStorageSync(USER_TOKEN_KEY);
  wx.removeStorageSync(USER_PROFILE_KEY);
  wx.removeStorageSync(USER_TOKEN_EXPIRES_KEY);
}

export function hasValidUserToken() {
  const expiresAt = new Date(String(wx.getStorageSync(USER_TOKEN_EXPIRES_KEY) || '')).getTime();
  return Boolean(getUserToken()) && Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000;
}

export function isAutoRegisterPaused() {
  return Boolean(wx.getStorageSync(AUTO_REGISTER_PAUSED_KEY));
}

export function resumeAutoRegister() {
  wx.removeStorageSync(AUTO_REGISTER_PAUSED_KEY);
}

import {
  ApiError,
  createAvatarUploadGrant,
  deleteMyUser,
  getMyUser,
  updateMyUser,
} from '../../utils/api';
import { ensureWechatSession } from '../../utils/account';
import {
  AUTO_REGISTER_PAUSED_KEY,
  clearUserSession,
  getCachedUserProfile,
  updateCachedUserProfile,
} from '../../utils/user-session';

Page({
  data: {
    loading: true,
    saving: false,
    uploading: false,
    error: '',
    nickname: '',
    avatarUrl: '',
    registeredAt: '',
    hasAccount: false,
  },
  onLoad() {
    const cached = getCachedUserProfile();
    if (cached) this.applyProfile(cached);
    this.load();
  },
  applyProfile(profile: {
    nickname: string | null;
    avatarUrl?: string | null;
    registeredAt: string;
  }) {
    this.setData({
      nickname: profile.nickname || '',
      avatarUrl: profile.avatarUrl || '',
      registeredAt: new Date(profile.registeredAt).toLocaleDateString('zh-CN'),
      hasAccount: true,
    });
  },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      await ensureWechatSession(true);
      const result = await getMyUser();
      updateCachedUserProfile(result.user);
      this.applyProfile(result.user);
    } catch (error) {
      this.setData({
        error: error instanceof ApiError ? error.message : '用户服务暂不可用',
      });
    } finally {
      this.setData({ loading: false });
    }
  },
  onNicknameInput(event: WechatMiniprogram.Input) {
    this.setData({ nickname: String(event.detail.value || '').slice(0, 32) });
  },
  async save() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      const result = await updateMyUser({ nickname: this.data.nickname.trim() || null });
      updateCachedUserProfile(result.user);
      this.applyProfile(result.user);
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: (error as Error).message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },
  async chooseAvatar(event: WechatMiniprogram.CustomEvent) {
    const avatarUrl = String((event.detail as { avatarUrl?: string }).avatarUrl || '');
    if (!avatarUrl || this.data.uploading) return;
    this.setData({ uploading: true, avatarUrl });
    try {
      const fileSize = await new Promise<number>((resolve, reject) =>
        wx.getFileInfo({
          filePath: avatarUrl,
          success: (result) => resolve(result.size),
          fail: reject,
        }),
      );
      if (fileSize > 2 * 1024 * 1024) throw new Error('头像不能超过 2MB');
      const grant = await createAvatarUploadGrant();
      await new Promise<void>((resolve, reject) => {
        wx.uploadFile({
          url: grant.uploadUrl,
          filePath: avatarUrl,
          name: 'file',
          formData: { grantId: grant.grantId, token: grant.token },
          success: (result) =>
            result.statusCode >= 200 && result.statusCode < 300
              ? resolve()
              : reject(new Error('头像上传失败')),
          fail: reject,
        });
      });
      await new Promise((resolve) => setTimeout(resolve, 800));
      const result = await getMyUser();
      updateCachedUserProfile(result.user);
      this.applyProfile(result.user);
      wx.showToast({ title: '头像已更新', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: (error as Error).message || '头像上传失败', icon: 'none' });
    } finally {
      this.setData({ uploading: false });
    }
  },
  clearProfile() {
    wx.showModal({
      title: '清除头像昵称？',
      content: '不会删除收藏、选择、反馈和提醒。',
      confirmText: '清除',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          const updated = await updateMyUser({ nickname: null, clearAvatar: true });
          updateCachedUserProfile(updated.user);
          this.applyProfile(updated.user);
          wx.showToast({ title: '已清除', icon: 'success' });
        } catch (error) {
          wx.showToast({ title: (error as Error).message || '清除失败', icon: 'none' });
        }
      },
    });
  },
  deleteAccount() {
    wx.showModal({
      title: '删除个人账号？',
      content: '收藏、选择、偏好和提醒将删除；已提交反馈保留内容但解除身份关联。',
      confirmText: '删除',
      confirmColor: '#b91c1c',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await deleteMyUser();
          clearUserSession();
          wx.setStorageSync(AUTO_REGISTER_PAUSED_KEY, true);
          wx.showToast({ title: '账号已删除', icon: 'success' });
          setTimeout(() => wx.switchTab({ url: '/pages/mine/index' }), 500);
        } catch (error) {
          wx.showToast({ title: (error as Error).message || '删除失败', icon: 'none' });
        }
      },
    });
  },
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("../../utils/api");
const account_1 = require("../../utils/account");
const user_session_1 = require("../../utils/user-session");
Page({
    data: {
        loading: true,
        saving: false,
        uploading: false,
        error: '',
        nickname: '',
        nicknameLength: 0,
        avatarUrl: '',
        registeredAt: '',
        hasAccount: false,
    },
    onLoad() {
        const cached = (0, user_session_1.getCachedUserProfile)();
        if (cached)
            this.applyProfile(cached);
        this.load();
    },
    applyProfile(profile) {
        this.setData({
            nickname: profile.nickname || '',
            nicknameLength: (profile.nickname || '').length,
            avatarUrl: profile.avatarUrl || '',
            registeredAt: new Date(profile.registeredAt).toLocaleDateString('zh-CN'),
            hasAccount: true,
        });
    },
    async load() {
        this.setData({ loading: true, error: '' });
        try {
            await (0, account_1.ensureWechatSession)(true);
            const result = await (0, api_1.getMyUser)();
            (0, user_session_1.updateCachedUserProfile)(result.user);
            this.applyProfile(result.user);
        }
        catch (error) {
            this.setData({
                error: error instanceof api_1.ApiError ? error.message : '用户服务暂不可用',
            });
        }
        finally {
            this.setData({ loading: false });
        }
    },
    onNicknameInput(event) {
        const nickname = String(event.detail.value || '').slice(0, 32);
        this.setData({ nickname, nicknameLength: nickname.length });
    },
    async save() {
        if (this.data.saving)
            return;
        this.setData({ saving: true });
        try {
            const result = await (0, api_1.updateMyUser)({ nickname: this.data.nickname.trim() || null });
            (0, user_session_1.updateCachedUserProfile)(result.user);
            this.applyProfile(result.user);
            wx.showToast({ title: '已保存', icon: 'success' });
        }
        catch (error) {
            wx.showToast({ title: error.message || '保存失败', icon: 'none' });
        }
        finally {
            this.setData({ saving: false });
        }
    },
    async chooseAvatar(event) {
        const avatarUrl = String(event.detail.avatarUrl || '');
        if (!avatarUrl || this.data.uploading)
            return;
        this.setData({ uploading: true, avatarUrl });
        try {
            const fileSize = await new Promise((resolve, reject) => wx.getFileInfo({
                filePath: avatarUrl,
                success: (result) => resolve(result.size),
                fail: reject,
            }));
            if (fileSize > 2 * 1024 * 1024)
                throw new Error('头像不能超过 2MB');
            const grant = await (0, api_1.createAvatarUploadGrant)();
            await new Promise((resolve, reject) => {
                wx.uploadFile({
                    url: grant.uploadUrl,
                    filePath: avatarUrl,
                    name: 'file',
                    formData: { grantId: grant.grantId, token: grant.token },
                    success: (result) => result.statusCode >= 200 && result.statusCode < 300
                        ? resolve()
                        : reject(new Error('头像上传失败')),
                    fail: reject,
                });
            });
            await new Promise((resolve) => setTimeout(resolve, 800));
            const result = await (0, api_1.getMyUser)();
            (0, user_session_1.updateCachedUserProfile)(result.user);
            this.applyProfile(result.user);
            wx.showToast({ title: '头像已更新', icon: 'success' });
        }
        catch (error) {
            wx.showToast({ title: error.message || '头像上传失败', icon: 'none' });
        }
        finally {
            this.setData({ uploading: false });
        }
    },
    clearProfile() {
        wx.showModal({
            title: '清除头像昵称？',
            content: '不会删除收藏、选择、反馈和提醒。',
            confirmText: '清除',
            success: async (result) => {
                if (!result.confirm)
                    return;
                try {
                    const updated = await (0, api_1.updateMyUser)({ nickname: null, clearAvatar: true });
                    (0, user_session_1.updateCachedUserProfile)(updated.user);
                    this.applyProfile(updated.user);
                    wx.showToast({ title: '已清除', icon: 'success' });
                }
                catch (error) {
                    wx.showToast({ title: error.message || '清除失败', icon: 'none' });
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
                if (!result.confirm)
                    return;
                try {
                    await (0, api_1.deleteMyUser)();
                    (0, user_session_1.clearUserSession)();
                    wx.setStorageSync(user_session_1.AUTO_REGISTER_PAUSED_KEY, true);
                    wx.showToast({ title: '账号已删除', icon: 'success' });
                    setTimeout(() => wx.switchTab({ url: '/pages/mine/index' }), 500);
                }
                catch (error) {
                    wx.showToast({ title: error.message || '删除失败', icon: 'none' });
                }
            },
        });
    },
});

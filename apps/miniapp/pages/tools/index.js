"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const share_1 = require("../../utils/share");
Page({
    onLoad() {
        (0, share_1.enablePublicShare)();
    },
    openPace() {
        wx.navigateTo({ url: '/pages/pace/index' });
    },
    openChecklist() {
        wx.navigateTo({ url: '/pages/checklist/index' });
    },
    onShareAppMessage() {
        (0, share_1.trackShare)('page_share', 'tools');
        return (0, share_1.getSharePayload)('tools', '/pages/tools/index');
    },
    onShareTimeline() {
        (0, share_1.trackShare)('timeline_share', 'tools');
        const payload = (0, share_1.getSharePayload)('tools', '/pages/tools/index');
        return { title: payload.title, imageUrl: payload.imageUrl };
    },
});

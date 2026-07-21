import { enablePublicShare, getSharePayload, trackShare } from '../../utils/share';

Page({
  onLoad() {
    enablePublicShare();
  },
  openPace() {
    wx.navigateTo({ url: '/pages/pace/index' });
  },
  openChecklist() {
    wx.navigateTo({ url: '/pages/checklist/index' });
  },
  onShareAppMessage() {
    trackShare('page_share', 'tools');
    return getSharePayload('tools', '/pages/tools/index');
  },
  onShareTimeline() {
    trackShare('timeline_share', 'tools');
    const payload = getSharePayload('tools', '/pages/tools/index');
    return { title: payload.title, imageUrl: payload.imageUrl };
  },
});

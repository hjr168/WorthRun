import { ChecklistItem, getChecklistTemplates } from '../../utils/api';
import { enablePublicShare, getSharePayload, trackShare } from '../../utils/share';

const groups = ['通用清单', '5K', '10K', '半马', '全马'];

// 页面显示文案 → 后端 checklist_templates 的 key
const typeKeyMap: Record<string, string> = {
  通用清单: 'general',
  '5K': '5K',
  '10K': '10K',
  半马: 'half',
  全马: 'full',
};

// 本地兜底数据：接口失败或离线时使用，保证清单页可用
const fallbackChecklist: Record<string, ChecklistItem[]> = {
  通用清单: [
    { groupName: '报名信息', itemName: '报名截止与是否抽签', itemStatus: 'pending_verify' },
    { groupName: '领物安排', itemName: '领物时间、地点、证件要求', itemStatus: 'pending_verify' },
    { groupName: '交通安排', itemName: '起终点交通、存包和接驳', itemStatus: 'pending_verify' },
    { groupName: '装备', itemName: '号码布、芯片、跑鞋、补给', itemStatus: 'pending_verify' },
    { groupName: '风险提示', itemName: '天气变化和赛事变更公告', itemStatus: 'pending_verify' },
  ],
  '5K': [
    { groupName: '完赛目标', itemName: '确认起跑时间和关门时间', itemStatus: 'pending_verify' },
    { groupName: '装备', itemName: '轻便跑鞋和基础补水', itemStatus: 'pending_verify' },
    { groupName: '新手提醒', itemName: '赛前不临时更换新装备', itemStatus: 'pending_verify' },
    { groupName: '交通安排', itemName: '提前确认短距离项目检录口', itemStatus: 'pending_verify' },
  ],
  '10K': [
    { groupName: '配速计划', itemName: '确认目标配速和补给点位置', itemStatus: 'pending_verify' },
    { groupName: '装备', itemName: '跑鞋、能量胶或随身补给', itemStatus: 'pending_verify' },
    { groupName: '赛事规则', itemName: '确认分区、检录和关门时间', itemStatus: 'pending_verify' },
    { groupName: '恢复安排', itemName: '赛后换衣、拉伸和返程路线', itemStatus: 'pending_verify' },
  ],
  半马: [
    {
      groupName: '训练状态',
      itemName: '确认最近长距离训练和身体状态',
      itemStatus: 'pending_verify',
    },
    { groupName: '补给策略', itemName: '确认能量胶、水站和盐丸安排', itemStatus: 'pending_verify' },
    { groupName: '赛事规则', itemName: '确认半马关门时间和医疗点', itemStatus: 'pending_verify' },
    { groupName: '装备', itemName: '比赛鞋、袜子、防磨和号码布固定', itemStatus: 'pending_verify' },
  ],
  全马: [
    { groupName: '身体状态', itemName: '确认无伤病、睡眠和赛前减量', itemStatus: 'pending_verify' },
    { groupName: '补给策略', itemName: '确认全程补给节奏和备用方案', itemStatus: 'pending_verify' },
    {
      groupName: '赛事规则',
      itemName: '确认分段关门时间、医疗点和退赛车',
      itemStatus: 'pending_verify',
    },
    { groupName: '赛后安排', itemName: '确认完赛后保暖、换衣和返程', itemStatus: 'pending_verify' },
  ],
};

Page({
  data: {
    loading: false,
    error: '',
    groupIndex: 0,
    groups,
    items: fallbackChecklist[groups[0]],
  },
  onLoad() {
    enablePublicShare();
    this.loadItems();
  },
  loadItems() {
    const groupName = groups[this.data.groupIndex];
    const type = typeKeyMap[groupName] || 'general';
    this.setData({ loading: true });
    getChecklistTemplates(type)
      .then((result) => {
        this.setData({ items: result.items, loading: false, error: '' });
      })
      .catch(() => {
        // 接口失败用本地兜底，保证离线可用
        this.setData({
          items: fallbackChecklist[groupName] || [],
          loading: false,
        });
      });
  },
  reload() {
    this.loadItems();
  },
  onGroupChange(event: WechatMiniprogram.PickerChange) {
    const groupIndex = Number(event.detail.value);
    this.setData({ groupIndex });
    this.loadItems();
  },
  onShareAppMessage() {
    trackShare('page_share', 'tools');
    return getSharePayload('tools', '/pages/checklist/index');
  },
  onShareTimeline() {
    trackShare('timeline_share', 'tools');
    const payload = getSharePayload('tools', '/pages/checklist/index');
    return { title: payload.title, imageUrl: payload.imageUrl };
  },
});

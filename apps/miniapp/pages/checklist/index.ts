import { ChecklistItem, getChecklistTemplates } from '../../utils/api';

const groups = ['通用清单', '5K', '10K', '半马', '全马'];

Page({
  data: {
    loading: true,
    error: '',
    groupIndex: 0,
    groups,
    items: [] as ChecklistItem[],
  },
  onLoad() {
    this.load();
  },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const res = await getChecklistTemplates();
      this.setData({ loading: false, items: res.items });
    } catch (error) {
      this.setData({ loading: false, error: (error as Error).message || '网络异常' });
    }
  },
  onGroupChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ groupIndex: Number(event.detail.value) });
  },
});

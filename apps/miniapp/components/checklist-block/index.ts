import { labelOf, infoStatusLabels } from '../../utils/format';

Component({
  properties: {
    items: {
      type: Array,
      value: [],
    },
  },
  observers: {
    items(value) {
      this.setData({
        rows: (value || []).map((item: Record<string, string>) => ({
          ...item,
          statusText: labelOf(infoStatusLabels, item.itemStatus),
          statusIcon: item.itemStatus === 'confirmed'
            ? '/assets/icons/circle-check-orange.png'
            : '/assets/icons/circle.png',
        })),
      });
    },
  },
  data: {
    rows: [] as Array<Record<string, string>>,
  },
});

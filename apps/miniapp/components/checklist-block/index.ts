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
        })),
      });
    },
  },
  data: {
    rows: [] as Array<Record<string, string>>,
  },
});

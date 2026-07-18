import {
  formatDate,
  formatDistance,
  labelOf,
  runJudgementLabels,
} from '../../utils/format';

Component({
  properties: {
    event: {
      type: Object,
      value: {},
    },
    showFavorite: {
      type: Boolean,
      value: true,
    },
  },
  observers: {
    event(value) {
      this.setData({
        dateText: formatDate(value?.eventDate),
        distanceText: formatDistance(value?.distanceItems),
        judgementText: labelOf(runJudgementLabels, value?.runJudgement),
        reasons: (value?.judgementReasons || []).slice(0, 2),
        tags: (value?.tags || []).slice(0, 3),
      });
    },
  },
  data: {
    dateText: '',
    distanceText: '',
    judgementText: '',
    reasons: [] as string[],
    tags: [] as string[],
  },
  methods: {
    onOpen() {
      this.triggerEvent('open', { id: this.data.event.id });
    },
    onFavorite() {
      this.triggerEvent('favorite', {
        id: this.data.event.id,
        isFavorite: this.data.event.isFavorite,
      });
    },
  },
});

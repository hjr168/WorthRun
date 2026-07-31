import { formatDate, formatDistance, labelOf, runJudgementLabels } from '../../utils/format';

const DEFAULT_EVENT_COVER = '/assets/images/event-cover-default.png';

function coverUrl(value?: string | null) {
  return value && !value.endsWith('event-cover-default.jpg') ? value : DEFAULT_EVENT_COVER;
}

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
        coverUrl: coverUrl(value?.coverThumbnailUrl || value?.coverImageUrl),
        coverMode: value?.coverImageMode === 'aspectFit' ? 'aspectFit' : 'aspectFill',
        dateText: formatDate(value?.eventDate),
        distanceText: formatDistance(value?.distanceItems),
        judgementText: labelOf(runJudgementLabels, value?.runJudgement),
        tags: (value?.tags || []).slice(0, 3),
      });
    },
  },
  data: {
    coverUrl: DEFAULT_EVENT_COVER,
    coverMode: 'aspectFill',
    dateText: '',
    distanceText: '',
    judgementText: '',
    tags: [] as string[],
  },
  methods: {
    onImageError() {
      this.setData({ coverUrl: DEFAULT_EVENT_COVER, coverMode: 'aspectFill' });
    },
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

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const format_1 = require("../../utils/format");
const DEFAULT_EVENT_COVER = '/assets/images/event-cover-default.png';
function coverUrl(value) {
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
                coverUrl: coverUrl((value === null || value === void 0 ? void 0 : value.coverThumbnailUrl) || (value === null || value === void 0 ? void 0 : value.coverImageUrl)),
                coverMode: (value === null || value === void 0 ? void 0 : value.coverImageMode) === 'aspectFit' ? 'aspectFit' : 'aspectFill',
                dateText: (0, format_1.formatDate)(value === null || value === void 0 ? void 0 : value.eventDate),
                distanceText: (0, format_1.formatDistance)(value === null || value === void 0 ? void 0 : value.distanceItems),
                judgementText: (0, format_1.labelOf)(format_1.runJudgementLabels, value === null || value === void 0 ? void 0 : value.runJudgement),
                reasons: ((value === null || value === void 0 ? void 0 : value.judgementReasons) || []).slice(0, 2),
                tags: ((value === null || value === void 0 ? void 0 : value.tags) || []).slice(0, 3),
            });
        },
    },
    data: {
        coverUrl: DEFAULT_EVENT_COVER,
        coverMode: 'aspectFill',
        dateText: '',
        distanceText: '',
        judgementText: '',
        reasons: [],
        tags: [],
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

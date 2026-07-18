"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const format_1 = require("../../utils/format");
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
                dateText: (0, format_1.formatDate)(value === null || value === void 0 ? void 0 : value.eventDate),
                distanceText: (0, format_1.formatDistance)(value === null || value === void 0 ? void 0 : value.distanceItems),
                judgementText: (0, format_1.labelOf)(format_1.runJudgementLabels, value === null || value === void 0 ? void 0 : value.runJudgement),
                reasons: ((value === null || value === void 0 ? void 0 : value.judgementReasons) || []).slice(0, 2),
                tags: ((value === null || value === void 0 ? void 0 : value.tags) || []).slice(0, 3),
            });
        },
    },
    data: {
        dateText: '',
        distanceText: '',
        judgementText: '',
        reasons: [],
        tags: [],
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

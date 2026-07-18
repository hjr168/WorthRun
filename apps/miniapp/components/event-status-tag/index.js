"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const event_detail_1 = require("../../utils/event-detail");
Component({
    properties: {
        signupStatus: {
            type: String,
            value: 'unknown',
        },
        eventDate: {
            type: String,
            value: '',
        },
    },
    observers: {
        'signupStatus,eventDate'(signupStatus, eventDate) {
            this.setData((0, event_detail_1.getEventDisplayStatus)(signupStatus, eventDate));
        },
    },
    data: {
        text: '待确认',
        tone: 'muted',
    },
});

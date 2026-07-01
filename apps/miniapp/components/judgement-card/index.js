"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const format_1 = require("../../utils/format");
Component({
    properties: {
        event: {
            type: Object,
            value: {},
        },
    },
    observers: {
        event(value) {
            this.setData({
                judgementText: (0, format_1.labelOf)(format_1.runJudgementLabels, value === null || value === void 0 ? void 0 : value.runJudgement),
                reasons: (value === null || value === void 0 ? void 0 : value.judgementReasons) || [],
                notice: format_1.complianceNotice,
            });
        },
    },
    data: {
        judgementText: '',
        reasons: [],
        notice: format_1.complianceNotice,
    },
});

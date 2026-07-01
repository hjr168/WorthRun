"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const format_1 = require("../../utils/format");
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
                rows: (value || []).map((item) => (Object.assign(Object.assign({}, item), { statusText: (0, format_1.labelOf)(format_1.infoStatusLabels, item.itemStatus) }))),
            });
        },
    },
    data: {
        rows: [],
    },
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const release_notes_1 = require("./utils/release-notes");
const share_1 = require("./utils/share");
App({
    globalData: {},
    onLaunch() {
        (0, share_1.loadShareSettings)().catch(() => { });
        (0, release_notes_1.refreshReleaseBadge)().catch(() => { });
    },
});

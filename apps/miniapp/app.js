"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const release_notes_1 = require("./utils/release-notes");
const share_1 = require("./utils/share");
const account_1 = require("./utils/account");
const api_1 = require("./utils/api");
App({
    globalData: {},
    onLaunch() {
        (0, share_1.loadShareSettings)().catch(() => { });
        (0, release_notes_1.refreshReleaseBadge)().catch(() => { });
        (0, account_1.ensureWechatSession)()
            .then((profile) => profile ? (0, api_1.recordActivity)({ entryPage: 'app_launch' }) : undefined)
            .catch(() => { });
    },
});

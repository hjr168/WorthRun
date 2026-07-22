"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultShareSettings = void 0;
exports.getCachedShareSettings = getCachedShareSettings;
exports.loadShareSettings = loadShareSettings;
exports.resolveShareTitle = resolveShareTitle;
exports.getSharePayload = getSharePayload;
exports.enablePublicShare = enablePublicShare;
exports.enableProductShareOnly = enableProductShareOnly;
exports.trackShare = trackShare;
exports.getProductHomeShare = getProductHomeShare;
const api_1 = require("./api");
const user_1 = require("./user");
const SETTINGS_KEY = 'worth-running_share_settings';
const MAX_TITLE_LENGTH = 40;
exports.defaultShareSettings = {
    revision: 'builtin-v1',
    scenes: {
        home: {
            titleTemplate: '哪场值得跑｜帮你判断一场比赛值不值得去',
            imageUrl: '/assets/share/share-brand.jpg',
        },
        events: {
            titleTemplate: '近期大湾区跑步赛事，一起看看哪场值得跑',
            imageUrl: '/assets/share/share-brand.jpg',
        },
        event_detail: {
            titleTemplate: '这场值得跑吗？{eventName}',
            imageUrl: '/assets/share/share-event.jpg',
        },
        tools: {
            titleTemplate: '配速、赛前清单，一次准备好｜哪场值得跑',
            imageUrl: '/assets/share/share-tools.jpg',
        },
        source_summary: {
            titleTemplate: '这场赛事信息，我帮你整理了｜{eventName}',
            imageUrl: '/assets/share/share-event.jpg',
        },
        release_notes: {
            titleTemplate: '哪场值得跑更新了｜{latestVersion}',
            imageUrl: '/assets/share/share-release.jpg',
        },
    },
};
let memorySettings = null;
function safeSettings(value) {
    const candidate = value;
    if (!(candidate === null || candidate === void 0 ? void 0 : candidate.scenes))
        return exports.defaultShareSettings;
    const scenes = Object.assign({}, exports.defaultShareSettings.scenes);
    Object.keys(scenes).forEach((scene) => {
        const current = candidate.scenes[scene];
        if ((current === null || current === void 0 ? void 0 : current.titleTemplate) && (current === null || current === void 0 ? void 0 : current.imageUrl))
            scenes[scene] = current;
    });
    return { revision: candidate.revision || exports.defaultShareSettings.revision, scenes };
}
function getCachedShareSettings() {
    if (memorySettings)
        return memorySettings;
    try {
        memorySettings = safeSettings(wx.getStorageSync(SETTINGS_KEY));
    }
    catch (_a) {
        memorySettings = exports.defaultShareSettings;
    }
    return memorySettings;
}
async function loadShareSettings() {
    try {
        const result = await (0, api_1.getShareSettings)();
        memorySettings = safeSettings(result.settings);
        wx.setStorageSync(SETTINGS_KEY, memorySettings);
    }
    catch (_a) {
        memorySettings = getCachedShareSettings();
    }
    return memorySettings;
}
function resolveShareTitle(template, variables = {}) {
    const resolved = template
        .replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_match, key) => variables[key] || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (resolved.length <= MAX_TITLE_LENGTH)
        return resolved;
    return `${resolved.slice(0, MAX_TITLE_LENGTH - 1).trim()}…`;
}
function getSharePayload(scene, path, variables = {}, override) {
    const setting = getCachedShareSettings().scenes[scene] || exports.defaultShareSettings.scenes[scene];
    return {
        title: (override === null || override === void 0 ? void 0 : override.title) || resolveShareTitle(setting.titleTemplate, variables),
        path,
        imageUrl: (override === null || override === void 0 ? void 0 : override.imageUrl) || setting.imageUrl,
    };
}
function enablePublicShare() {
    wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage', 'shareTimeline'] });
}
function enableProductShareOnly() {
    wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage'] });
}
function trackShare(shareType, scene, eventId, requestShareToken = false) {
    return (0, api_1.recordShare)({
        userKey: (0, user_1.getUserKey)(),
        eventId,
        shareType,
        scene,
        requestShareToken,
    }).catch(() => ({ id: '', shareToken: null }));
}
function getProductHomeShare() {
    trackShare('page_share', 'personal_home');
    return getSharePayload('home', '/pages/home/index');
}

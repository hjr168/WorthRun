"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.radarGroupOrder = exports.radarGroupDisplay = void 0;
exports.buildRadarQuery = buildRadarQuery;
exports.hasNoPreferences = hasNoPreferences;
exports.toDisplayGroups = toDisplayGroups;
exports.radarTotalCount = radarTotalCount;
/** 雷达查询参数（GET，逗号分隔）。空数组省略该维度。 */
function buildRadarQuery(input) {
    const params = {};
    if (input.cities.length)
        params.cities = input.cities.join(',');
    if (input.distances.length)
        params.distances = input.distances.join(',');
    if (input.focusTags.length)
        params.focusTags = input.focusTags.join(',');
    if (input.windowDays)
        params.windowDays = input.windowDays;
    if (input.campaign)
        params.campaign = input.campaign;
    if (input.limitPerGroup)
        params.limitPerGroup = input.limitPerGroup;
    return params;
}
/** 是否无任何偏好（用于显示设置引导，而非伪装个性化）。 */
function hasNoPreferences(filters) {
    return filters.cities.length === 0 && filters.distances.length === 0 && filters.focusTags.length === 0;
}
/** 分组展示配置：key -> 标题。无偏好时 matched 组显示"近期值得关注"。 */
exports.radarGroupDisplay = {
    closingSoon: '即将截止',
    signupOpening: '本周开报',
    recentlyChanged: '最近确认的变化',
    matched: '更符合你的偏好',
};
/** 雷达分组在页面上的展示顺序（与后端优先级一致）。 */
exports.radarGroupOrder = [
    'closingSoon',
    'signupOpening',
    'recentlyChanged',
    'matched',
];
/**
 * 把雷达响应的四组映射为有序、带标题的展示分组（过滤空组）。
 * 无偏好时 matched 组标题改为"近期值得关注"（交接文档 §6.3）。
 */
function toDisplayGroups(response) {
    const noPref = hasNoPreferences(response.filters);
    return exports.radarGroupOrder
        .map((key) => {
        const items = response.groups[key] || [];
        return {
            key,
            title: key === 'matched' && noPref ? '近期值得关注' : exports.radarGroupDisplay[key],
            items,
        };
    })
        .filter((g) => g.items.length > 0);
}
/** 汇总：各类命中数量（用于副标题"命中 N 场赛事"）。 */
function radarTotalCount(response) {
    return response.total;
}

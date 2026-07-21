"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const share_1 = require("../../utils/share");
Page({
    data: {
        distance: '10',
        hours: '1',
        minutes: '0',
        seconds: '0',
        paceText: '',
        splits: [],
    },
    onLoad() {
        (0, share_1.enablePublicShare)();
        this.calculate();
    },
    onDistance(event) {
        this.setData({ distance: event.detail.value });
    },
    onHours(event) {
        this.setData({ hours: event.detail.value });
    },
    onMinutes(event) {
        this.setData({ minutes: event.detail.value });
    },
    onSeconds(event) {
        this.setData({ seconds: event.detail.value });
    },
    formatSeconds(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.round(totalSeconds % 60);
        return `${minutes}'${String(seconds).padStart(2, '0')}"/km`;
    },
    buildSplitDistances(distance) {
        if (distance <= 1)
            return [distance];
        const splitDistances = [1];
        for (let km = 5; km < distance; km += 5) {
            splitDistances.push(km);
        }
        const lastDistance = splitDistances[splitDistances.length - 1];
        if (lastDistance !== distance) {
            splitDistances.push(distance);
        }
        return splitDistances;
    },
    formatDistanceLabel(distance) {
        return `${Number(distance.toFixed(4))} km`;
    },
    calculate() {
        const distance = Number(this.data.distance);
        const totalSeconds = Number(this.data.hours || 0) * 3600 +
            Number(this.data.minutes || 0) * 60 +
            Number(this.data.seconds || 0);
        if (!distance || distance <= 0 || !totalSeconds || totalSeconds <= 0) {
            wx.showToast({ title: '请输入有效距离和时间', icon: 'none' });
            return;
        }
        const perKm = totalSeconds / distance;
        const splits = this.buildSplitDistances(distance).map((km) => `${this.formatDistanceLabel(km)}：${this.formatClock(perKm * km)}`);
        this.setData({ paceText: this.formatSeconds(perKm), splits });
    },
    formatClock(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.round(seconds % 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    },
    onShareAppMessage() {
        (0, share_1.trackShare)('page_share', 'tools');
        return (0, share_1.getSharePayload)('tools', '/pages/pace/index');
    },
    onShareTimeline() {
        (0, share_1.trackShare)('timeline_share', 'tools');
        const payload = (0, share_1.getSharePayload)('tools', '/pages/pace/index');
        return { title: payload.title, imageUrl: payload.imageUrl };
    },
});

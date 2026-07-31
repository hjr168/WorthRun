import { describe, expect, it } from 'vitest';
import { mediaDisplayMode, mediaReviewIssues, mediaUploadStatus } from './mediaGovernance.js';

describe('event media governance', () => {
  it('distinguishes configured retry from unavailable media service', () => {
    expect(mediaUploadStatus({}, false)).toBe('pending_configuration');
    expect(mediaUploadStatus({}, true)).toBe('pending_retry');
    expect(mediaUploadStatus({ cloudbaseFileId: 'hero', thumbnailFileId: 'thumb' }, true)).toBe(
      'uploaded',
    );
  });

  it('requires source, attribution, and both cloud derivatives before approval', () => {
    expect(mediaReviewIssues({})).toEqual([
      '媒体必须保留确认来源页',
      '媒体必须填写图片署名',
      '媒体必须先完成 CloudBase 主图和缩略图上传',
    ]);
    expect(
      mediaReviewIssues({
        sourcePageUrl: 'https://official.example/race',
        attribution: '主办方',
        cloudbaseFileId: 'hero',
        thumbnailFileId: 'thumb',
      }),
    ).toEqual([]);
  });

  it('preserves complete official banners and portrait artwork', () => {
    expect(mediaDisplayMode({ width: 4583, height: 1458 })).toBe('aspectFit');
    expect(mediaDisplayMode({ width: 501, height: 280 })).toBe('aspectFit');
    expect(mediaDisplayMode({ width: 600, height: 900 })).toBe('aspectFit');
    expect(mediaDisplayMode({ width: 1200, height: 800 })).toBe('aspectFill');
    expect(mediaDisplayMode()).toBe('aspectFill');
  });
});

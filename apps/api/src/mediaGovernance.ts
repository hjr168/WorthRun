export type MediaReviewCandidate = {
  cloudbaseFileId?: string | null;
  thumbnailFileId?: string | null;
  attribution?: string | null;
  sourcePageUrl?: string | null;
  width?: number | null;
  height?: number | null;
};

export function mediaDisplayMode(asset?: Pick<MediaReviewCandidate, 'width' | 'height'> | null) {
  if (!asset?.width || !asset.height) return 'aspectFill' as const;
  const ratio = asset.width / asset.height;
  return ratio > 1.75 || ratio < 0.8 ? ('aspectFit' as const) : ('aspectFill' as const);
}

export function mediaUploadStatus(
  asset: Pick<MediaReviewCandidate, 'cloudbaseFileId' | 'thumbnailFileId'>,
  configured: boolean,
) {
  if (asset.cloudbaseFileId && asset.thumbnailFileId) return 'uploaded' as const;
  return configured ? ('pending_retry' as const) : ('pending_configuration' as const);
}

export function mediaReviewIssues(asset: MediaReviewCandidate) {
  const issues: string[] = [];
  if (!asset.sourcePageUrl) issues.push('媒体必须保留确认来源页');
  if (!asset.attribution?.trim()) issues.push('媒体必须填写图片署名');
  if (!asset.cloudbaseFileId || !asset.thumbnailFileId) {
    issues.push('媒体必须先完成 CloudBase 主图和缩略图上传');
  }
  return issues;
}

export type ProductFeedbackContext =
  | 'home'
  | 'events'
  | 'event_detail'
  | 'source_summary'
  | 'favorites'
  | 'choices'
  | 'mine';

export function resolveMiniappVersion(miniProgram?: {
  version?: string;
  envVersion?: string;
}) {
  const version = miniProgram?.version?.trim();
  if (version) return version;
  const envVersion = miniProgram?.envVersion?.trim();
  return envVersion && ['develop', 'trial', 'release'].includes(envVersion)
    ? envVersion
    : undefined;
}

export function getMiniappVersion() {
  try {
    return resolveMiniappVersion(wx.getAccountInfoSync().miniProgram);
  } catch {
    return undefined;
  }
}

export function productFeedbackUrl(
  contextPage: ProductFeedbackContext,
  relatedRequestId?: string,
) {
  const query = [`contextPage=${encodeURIComponent(contextPage)}`];
  if (relatedRequestId) query.push(`relatedRequestId=${encodeURIComponent(relatedRequestId)}`);
  return `/pages/product-feedback/index?${query.join('&')}`;
}

export function openProductFeedback(
  contextPage: ProductFeedbackContext,
  relatedRequestId?: string,
) {
  wx.navigateTo({ url: productFeedbackUrl(contextPage, relatedRequestId) });
}

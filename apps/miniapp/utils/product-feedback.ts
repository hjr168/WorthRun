export type ProductFeedbackContext =
  | 'home'
  | 'events'
  | 'event_detail'
  | 'source_summary'
  | 'favorites'
  | 'choices'
  | 'mine';

export function getMiniappVersion() {
  try {
    return wx.getAccountInfoSync().miniProgram.version || undefined;
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

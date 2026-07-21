export type ProductFeedbackContext =
  | 'home'
  | 'events'
  | 'event_detail'
  | 'source_summary'
  | 'favorites'
  | 'choices'
  | 'mine';

export const productFeedbackContexts: ProductFeedbackContext[] = [
  'home',
  'events',
  'event_detail',
  'source_summary',
  'favorites',
  'choices',
  'mine',
];

export function resolveProductFeedbackContext(value?: string) {
  const normalized = value?.trim() || '';
  if (productFeedbackContexts.includes(normalized as ProductFeedbackContext)) {
    return {
      contextPage: normalized as ProductFeedbackContext,
      customContextPage: '',
      isCustomContext: false,
    };
  }
  if (normalized) {
    return {
      contextPage: 'mine' as ProductFeedbackContext,
      customContextPage: normalized,
      isCustomContext: true,
    };
  }
  return {
    contextPage: 'mine' as ProductFeedbackContext,
    customContextPage: '',
    isCustomContext: false,
  };
}

export function canSubmitProductFeedback(
  contentLength: number,
  isCustomContext: boolean,
  customContextPage: string,
) {
  const hasValidContent = contentLength >= 6 && contentLength <= 500;
  return hasValidContent && (!isCustomContext || Boolean(customContextPage.trim()));
}

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

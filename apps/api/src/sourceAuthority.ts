const communityAggregatorDomains = ['chinamarathon.com', 'zuicool.com'];

export function hasOfficialEvidence(
  sourceLevel: string,
  officialUrl: string | null | undefined,
  sourceUrl: string | null | undefined,
) {
  if (!officialUrl) return false;
  if (sourceLevel !== 'community') return true;
  try {
    const officialHost = new URL(officialUrl).hostname.toLowerCase();
    const sourceHost = sourceUrl ? new URL(sourceUrl).hostname.toLowerCase() : '';
    if (communityAggregatorDomains.some((domain) => hostMatches(officialHost, domain)))
      return false;
    return !sourceHost || officialHost !== sourceHost;
  } catch {
    return false;
  }
}

function hostMatches(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

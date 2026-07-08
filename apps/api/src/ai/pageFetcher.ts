import * as cheerio from 'cheerio';
import robotsParserModule from 'robots-parser';

const DEFAULT_USER_AGENT = process.env.AI_INGEST_USER_AGENT || 'WorthRunBot/0.1';
const MAX_HTML_BYTES = 800_000;
const MAX_TEXT_CHARS = 60_000;
const robotsParser = robotsParserModule as unknown as (
  url: string,
  robotstxt: string,
) => { isAllowed(url: string, userAgent?: string): boolean | undefined };

export interface FetchedPage {
  url: string;
  title: string;
  text: string;
}

interface FetchBlockProbe {
  status: number;
  server?: string | null;
  body: string;
}

export function normalizeAllowedDomains(domains: string[]) {
  return domains
    .map((domain) => normalizeDomain(domain))
    .filter((domain): domain is string => Boolean(domain));
}

export function shouldAllowUrl(url: string, allowedDomains: string[]) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  const domains = normalizeAllowedDomains(allowedDomains);
  return (
    domains.length === 0 ||
    domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  );
}

export async function fetchRobotsAllowedPage(
  url: string,
  allowedDomains: string[],
): Promise<FetchedPage> {
  if (!shouldAllowUrl(url, allowedDomains)) {
    throw new Error('来源 URL 不在允许域名内');
  }

  const parsed = new URL(url);
  const robotsUrl = `${parsed.origin}/robots.txt`;
  const robotsResponse = await fetch(robotsUrl, {
    headers: { 'User-Agent': DEFAULT_USER_AGENT },
  }).catch(() => null);

  if (robotsResponse?.ok) {
    const robotsText = await robotsResponse.text();
    const robotsBlockReason = detectFetchBlockReason({
      status: robotsResponse.status,
      server: robotsResponse.headers.get('server'),
      body: robotsText,
    });
    if (robotsBlockReason) {
      throw new Error(robotsBlockReason);
    }

    const robots = robotsParser(robotsUrl, robotsText);
    if (robots.isAllowed(url, DEFAULT_USER_AGENT) === false) {
      throw new Error('robots.txt 不允许抓取该页面');
    }
  }

  const response = await fetch(url, { headers: { 'User-Agent': DEFAULT_USER_AGENT } });
  const html = await response.text();
  const blockReason = detectFetchBlockReason({
    status: response.status,
    server: response.headers.get('server'),
    body: html,
  });
  if (blockReason) {
    throw new Error(blockReason);
  }

  if (!response.ok) {
    throw new Error(`来源页面请求失败：${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType && !contentType.includes('html') && !contentType.includes('text')) {
    throw new Error('来源页面不是可解析的 HTML 或文本');
  }

  const $ = cheerio.load(html.slice(0, MAX_HTML_BYTES));
  $('script,style,noscript,svg,iframe').remove();
  const title = $('title').text().replace(/\s+/g, ' ').trim();
  const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_CHARS);
  return { url, title, text };
}

export function detectFetchBlockReason(probe: FetchBlockProbe) {
  const server = probe.server || '';
  const body = probe.body.slice(0, 4000);
  const looksLikeTencentEdgeOne =
    server.toLowerCase().includes('tencentedgeone') ||
    body.includes('TencentEdgeOne') ||
    body.includes('turing.captcha.qcloud.com') ||
    body.includes('TCaptcha');

  if (probe.status === 567 && looksLikeTencentEdgeOne) {
    return '目标站点返回腾讯 EdgeOne 访问验证（HTTP 567），服务端无法直接抓取该页面；请改用该站公开数据接口、赛事详情页，或先人工补充候选赛事来源。';
  }

  if (looksLikeTencentEdgeOne && body.includes('<script')) {
    return '目标站点返回腾讯 EdgeOne JS 验证页，不是可抽取的赛事正文；请改用该站公开数据接口、赛事详情页，或先人工补充候选赛事来源。';
  }

  return null;
}

function normalizeDomain(domain: string) {
  const trimmed = domain.trim().toLowerCase().replace(/^\*\./, '').replace(/\/+$/, '');
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return parsed.hostname || null;
  } catch {
    const [hostname] = trimmed.split('/');
    return hostname || null;
  }
}

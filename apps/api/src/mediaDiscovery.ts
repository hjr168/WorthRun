import { createHash } from 'node:crypto';
import dns from 'node:dns/promises';
import https from 'node:https';
import { isIP } from 'node:net';
import * as cheerio from 'cheerio';

export const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
export const MEDIA_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/[\[\]]/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (isIP(host)) return isPrivateAddress(host);
  return false;
}

function ipv4ToNumber(value: string) {
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return ((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3];
}

function ipv6Bytes(value: string) {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, '');
  const [head, tail] = normalized.split('::');
  const left = head ? head.split(':').filter(Boolean) : [];
  const right = tail ? tail.split(':').filter(Boolean) : [];
  const expandPart = (part: string) => {
    if (!part.includes('.')) return [parseInt(part || '0', 16)];
    const ipv4 = ipv4ToNumber(part);
    return ipv4 === null ? [] : [ipv4 >>> 16, ipv4 & 0xffff];
  };
  const words = [...left.flatMap(expandPart), ...Array(Math.max(0, 8 - left.length - right.length)).fill(0), ...right.flatMap(expandPart)];
  if (words.length !== 8 || words.some((word) => !Number.isInteger(word) || word < 0 || word > 0xffff)) return null;
  return words;
}

export function isPrivateAddress(address: string) {
  const version = isIP(address);
  if (version === 4) {
    const value = ipv4ToNumber(address);
    if (value === null) return true;
    const first = value >>> 24;
    const second = (value >>> 16) & 255;
    const third = (value >>> 8) & 255;
    return first === 0 || first === 10 || first === 127 || (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && (second === 0 || second === 168)) || (first === 198 && (second >= 18 && second <= 19 || second === 51 && third === 100)) ||
      (first === 203 && second === 0) || first >= 224;
  }
  if (version !== 6) return true;
  const words = ipv6Bytes(address);
  if (!words) return true;
  const isUnspecified = words.every((word) => word === 0);
  const isLoopback = words.slice(0, 7).every((word) => word === 0) && words[7] === 1;
  const isMappedV4 = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const first = words[0];
  const second = words[1];
  return isUnspecified || isLoopback || isMappedV4 || (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00 ||
    (first === 0x2001 && second === 0x0db8);
}

export async function assertSafeImageUrlResolved(
  value: string,
  allowedHosts: string[] = [],
  lookup: (hostname: string) => Promise<Array<{ address: string; family: number }>> = async (hostname) => dns.lookup(hostname, { all: true, verbatim: true }),
) {
  const url = assertSafeImageUrl(value, allowedHosts);
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(url.hostname);
  } catch {
    throw new Error('图片来源域名无法解析');
  }
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new Error('图片来源域名解析结果命中内网阻断规则');
  }
  return { url, addresses };
}

export async function fetchPinnedHttps(
  url: URL,
  address: { address: string; family: number },
  timeoutMs = 12_000,
  accept = 'image/*',
) {
  return new Promise<{ status: number; location: string | null; contentType: string | null; contentLength: number | null; buffer: Buffer }>((resolve, reject) => {
    const request = https.request({
      protocol: 'https:',
      hostname: address.address,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      servername: url.hostname,
      headers: { host: url.host, accept, 'user-agent': 'WorthRun-media-fetch/1.0' },
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      timeout: timeoutMs,
    }, (response) => {
      const contentLength = Number(response.headers['content-length'] || 0) || null;
      if (contentLength && contentLength > MEDIA_MAX_BYTES) {
        response.destroy();
        reject(new Error('图片超过 8MB 限制'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MEDIA_MAX_BYTES) {
          response.destroy(new Error('图片超过 8MB 限制'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        location: typeof response.headers.location === 'string' ? response.headers.location : null,
        contentType: typeof response.headers['content-type'] === 'string' ? response.headers['content-type'] : null,
        contentLength,
        buffer: Buffer.concat(chunks),
      }));
    });
    request.on('timeout', () => request.destroy(new Error('图片下载超时')));
    request.on('error', reject);
    request.end();
  });
}

export function assertSafeImageUrl(value: string, allowedHosts: string[] = []) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('图片来源必须使用 HTTPS');
  if (isPrivateHostname(url.hostname)) throw new Error('图片来源地址命中内网阻断规则');
  const host = url.hostname.toLowerCase();
  if (allowedHosts.length && !allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    throw new Error('图片来源域名不在确认的官网/主办方域名内');
  }
  return url;
}

export function imageMagicMime(buffer: Buffer) {
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

export function extractImageCandidates(html: string, pageUrl: string) {
  const $ = cheerio.load(html);
  const explicitValues = [
    $('meta[property="og:image"]').attr('content'),
    $('meta[name="twitter:image"]').attr('content'),
    $('script[type="application/ld+json"]').toArray().flatMap((node) => {
      try {
        const parsed = JSON.parse($(node).text()) as any;
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        return rows.flatMap((item) => {
          const images = Array.isArray(item?.image) ? item.image : [item?.image];
          return images.map((image: unknown) => typeof image === 'string' ? image : (image as { url?: unknown } | null)?.url).filter((image: unknown): image is string => typeof image === 'string' && image.length > 0);
        });
      } catch { return []; }
    }),
  ].flat().filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const imageNodes = $('img, picture source').toArray()
    .map((node, index) => {
      const element = $(node);
      const srcset = element.attr('srcset')?.split(',')[0]?.trim().split(/\s+/)[0];
      const value =
        element.attr('src') ||
        element.attr('data-src') ||
        element.attr('data-original') ||
        srcset;
      const hint = [
        element.attr('class'),
        element.attr('id'),
        element.attr('alt'),
        value,
      ].filter(Boolean).join(' ').toLowerCase();
      const score =
        (/(?:race|event|marathon|赛事|賽事)/.test(hint) ? 4 : 0) +
        (/(?:hero|banner|cover|kv|主图|主圖|横幅|橫幅)/.test(hint) ? 4 : 0) -
        (/(?:logo|icon|arrow|checkmark|sponsor)/.test(hint) ? 3 : 0);
      return { value, score, index };
    })
    .filter((item): item is { value: string; score: number; index: number } => Boolean(item.value))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.value);

  const resolved: string[] = [];
  for (const value of [...explicitValues, ...imageNodes]) {
    try {
      const url = new URL(value.trim(), pageUrl);
      if (url.protocol !== 'https:') continue;
      if (/\.(?:svg|gif|ico)(?:$|[?#])/i.test(url.pathname)) continue;
      if (!/\.(?:jpe?g|png|webp)(?:$|[?#])/i.test(url.pathname) && !explicitValues.includes(value)) continue;
      resolved.push(url.toString());
    } catch {
      // 忽略来源页中不完整或被注释截断的图片属性。
    }
  }
  return [...new Set(resolved)].slice(0, 10);
}

export function validateImagePayload(input: { buffer: Buffer; contentType?: string | null; contentLength?: number | null }) {
  if (input.buffer.length > MEDIA_MAX_BYTES || (input.contentLength || 0) > MEDIA_MAX_BYTES) throw new Error('图片超过 8MB 限制');
  const magicMime = imageMagicMime(input.buffer);
  if (!magicMime || !MEDIA_MIME_TYPES.has(magicMime)) throw new Error('图片 MIME 或文件魔数不合法');
  const declaredMime = input.contentType?.split(';')[0]?.trim().toLowerCase();
  if (declaredMime && declaredMime !== 'application/octet-stream' && declaredMime !== magicMime) throw new Error('图片 MIME 与文件内容不一致');
  return magicMime;
}

export function mediaSha256(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function imageDimensions(buffer: Buffer, mimeType: string) {
  if (mimeType === 'image/png' && buffer.length >= 24) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (mimeType === 'image/webp' && buffer.length >= 30 && buffer.subarray(12, 16).toString() === 'VP8X') {
    return { width: 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16), height: 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16) };
  }
  if (mimeType === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  return null;
}

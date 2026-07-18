/**
 * 微信小程序码生成模块。
 *
 * 通过 WX_APPID + WX_APPSECRET 获取 access_token，调用 getwxacodeunlimit 生成小程序码。
 * access_token 内存缓存（TTL 略短于微信 7200s 有效期）。
 * 若未配置 WX_APPID / WX_APPSECRET，返回 null，由调用方走降级路径。
 *
 * 参考文档：
 * - https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/mp-access-token/getAccessToken.html
 * - https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/qrcode-link/getwxacodeunlimit.html
 */

interface CachedToken {
  value: string;
  expiresAt: number;
}

export type MiniProgramEnvVersion = 'develop' | 'trial' | 'release';

let cachedToken: CachedToken | null = null;

const TOKEN_BASE = 'https://api.weixin.qq.com/cgi-bin/token';
const CODE_API = 'https://api.weixin.qq.com/wxa/getwxacodeunlimit';

async function getAccessToken(): Promise<string | null> {
  const appid = process.env.WX_APPID;
  const secret = process.env.WX_APPSECRET;
  if (!appid || !secret) return null;

  // 缓存有效则直接复用（提前 60s 失效，避免边界）
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const url = `${TOKEN_BASE}?grant_type=client_credential&appid=${appid}&secret=${secret}`;
  const res = await fetch(url);
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    errcode?: number;
    errmsg?: string;
  };
  if (!data.access_token) return null;

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 7200) * 1000,
  };
  return cachedToken.value;
}

/**
 * 生成小程序码 PNG Buffer。
 * @param scene 场景值（如 `id=xxxx`），最大 32 字符，仅支持数字/字母/特殊字符 !#$&'()*+,/:;=?@-._
 * @param page 小程序页面路径（不带前导 /），如 `pages/event-detail/index`
 * @returns PNG Buffer，若未配置 AppSecret 或调用失败返回 null
 */
export async function getMiniProgramCode(
  scene: string,
  page: string,
  envVersion: MiniProgramEnvVersion = 'release',
): Promise<Buffer | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const res = await fetch(`${CODE_API}?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scene,
      page,
      width: 280,
      check_path: false,
      env_version: envVersion,
    }),
  });

  const contentType = res.headers.get('content-type') || '';
  // 微信在出错时返回 JSON，成功时返回 image
  if (!contentType.includes('image')) return null;

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

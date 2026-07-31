'use strict';

const crypto = require('node:crypto');
const Busboy = require('busboy');

const MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAIN_API_BASE_URL = 'https://run-api.huangjiarong.top';

function envValue(standardName, hbuilderName) {
  return process.env[standardName] || process.env[hbuilderName] || '';
}

function mainApiBaseUrl() {
  const configured = envValue('MAIN_API_BASE_URL', 'MAINAPIBASEURL');
  try {
    const url = new URL(configured);
    if (url.protocol === 'https:') return url.origin;
  } catch (_) {
    // HBuilderX 5.15 的配置输入可能过滤标点，非法值使用受控生产地址。
  }
  return DEFAULT_MAIN_API_BASE_URL;
}

function response(statusCode, body) {
  return { mpserverlessComposedResponse: true, isBase64Encoded: false, statusCode, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
}
function header(event, name) {
  const headers = event.headers || {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}
function json(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded === true || event.isBase64Encoded === 'true' ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}
function assertSecret(event) {
  const supplied = header(event, 'x-worthrun-event-media-secret');
  const expected = envValue('EVENT_MEDIA_SHARED_SECRET', 'EVENTMEDIASHAREDSECRET');
  if (!expected || supplied !== expected) throw Object.assign(new Error('认证失败'), { statusCode: 401 });
}
function magicMime(buffer) {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}
function safeFileName(mime) { return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[mime]; }
function imageDimensions(buffer, mimeType) {
  if (mimeType === 'image/png' && buffer.length >= 24) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (mimeType === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  if (mimeType === 'image/webp' && buffer.length >= 30 && buffer.subarray(12, 16).toString() === 'VP8X') return { width: 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16), height: 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16) };
  return null;
}
function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(event.body || '', event.isBase64Encoded === true || event.isBase64Encoded === 'true' ? 'base64' : 'binary');
    const parser = Busboy({ headers: { 'content-type': header(event, 'content-type') }, limits: { files: 1, fileSize: MAX_BYTES } });
    const fields = {}; let file = null; let size = 0;
    parser.on('field', (name, value) => { fields[name] = value; });
    parser.on('file', (_name, stream, info) => {
      const chunks = []; stream.on('data', (chunk) => { size += chunk.length; chunks.push(chunk); });
      stream.on('limit', () => reject(Object.assign(new Error('图片不能超过 8MB'), { statusCode: 413 })));
      stream.on('end', () => { file = { buffer: Buffer.concat(chunks), filename: info.filename, mimeType: info.mimeType }; });
    });
    parser.on('error', reject);
    parser.on('finish', () => file && size ? resolve({ fields, file }) : reject(Object.assign(new Error('缺少图片文件'), { statusCode: 400 })));
    parser.end(body);
  });
}
async function uploadMedia(event) {
  assertSecret(event);
  const { fields, file } = await parseMultipart(event);
  const mimeType = magicMime(file.buffer);
  if (!mimeType || !safeFileName(mimeType)) throw Object.assign(new Error('仅支持 JPEG、PNG 或 WebP，且必须通过魔数校验'), { statusCode: 400 });
  if (file.buffer.length > MAX_BYTES) throw Object.assign(new Error('图片不能超过 8MB'), { statusCode: 413 });
  const assetId = String(fields.assetId || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!assetId) throw Object.assign(new Error('缺少 assetId'), { statusCode: 400 });
  const digest = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const dimensions = imageDimensions(file.buffer, mimeType);
  // 不再在云函数内用 sharp 压缩：原生模块在支付宝云难以稳定部署，
  // 且云存储（底层阿里云 OSS）支持在下载 URL 上用 x-oss-process 实时压缩，
  // 由主 API 在返回封面地址时按场景拼接参数（缩略图/大图）。
  // 因此这里只存一份原图，主 API 通过 originalFileId/cloudbaseFileId/thumbnailFileId
  // 都指向它，展示时由 OSS 实时生成压缩版本。
  const derivative = { mimeType, extension: safeFileName(mimeType), width: dimensions?.width || null, height: dimensions?.height || null };
  const base = `event-media/${assetId}/${digest}`;
  const original = await uniCloud.uploadFile({ cloudPath: `${base}-original.${safeFileName(mimeType)}`, fileContent: file.buffer, cloudPathAsRealPath: true });
  // hero 与 thumbnail 复用同一份原图文件 ID，由 OSS 实时处理区分尺寸，
  // 避免存储三份冗余文件。
  const heroFileId = original.fileID;
  const thumbnailFileId = original.fileID;
  try {
    const sharedSecret = envValue('EVENT_MEDIA_SHARED_SECRET', 'EVENTMEDIASHAREDSECRET');
    const result = await uniCloud.httpclient.request(`${mainApiBaseUrl()}/api/internal/event-media/complete`, {
      method: 'POST', contentType: 'json', dataType: 'json', data: { assetId, sha256: digest, mimeType: derivative.mimeType, originalFileId: original.fileID, cloudbaseFileId: heroFileId, thumbnailFileId, width: derivative.width, height: derivative.height, processedBySharp: false, heroBytes: file.buffer.length, thumbnailBytes: file.buffer.length, originalBytes: file.buffer.length },
      headers: { 'x-worthrun-event-media-secret': sharedSecret }, timeout: 8000,
    });
    if (result.status < 200 || result.status >= 300) throw new Error('主 API 媒体登记失败');
  } catch (error) {
    await uniCloud.deleteFile({ fileList: [original.fileID] }).catch(() => undefined);
    throw error;
  }
  return response(201, { uploaded: true, assetId, sha256: digest, fileId: heroFileId, thumbnailFileId, originalFileId: original.fileID, processedBySharp: false, heroBytes: file.buffer.length, thumbnailBytes: file.buffer.length, originalBytes: file.buffer.length });
}
exports.main = async (event) => {
  try {
    const method = String(event.httpMethod || 'POST').toUpperCase();
    if (method === 'DELETE') { assertSecret(event); const input = json(event); const fileList = Array.isArray(input.fileIds) ? input.fileIds.slice(0, 100) : []; if (fileList.length) await uniCloud.deleteFile({ fileList }); return response(200, { deleted: fileList.length }); }
    const contentType = header(event, 'content-type');
    if (contentType.includes('application/json')) {
      assertSecret(event); const input = json(event);
      if (input.action === 'delete-orphans' && Array.isArray(input.fileIds)) {
        const sharedSecret = envValue('EVENT_MEDIA_SHARED_SECRET', 'EVENTMEDIASHAREDSECRET');
        const check = await uniCloud.httpclient.request(`${mainApiBaseUrl()}/api/internal/event-media/orphan-check`, { method: 'POST', contentType: 'json', dataType: 'json', data: { fileIds: input.fileIds.slice(0, 500) }, headers: { 'x-worthrun-event-media-secret': sharedSecret }, timeout: 8000 });
        if (check.status < 200 || check.status >= 300) throw Object.assign(new Error('孤儿文件校验失败'), { statusCode: check.status });
        const orphanFileIds = check.data?.orphanFileIds || [];
        if (orphanFileIds.length) await uniCloud.deleteFile({ fileList: orphanFileIds.slice(0, 100) });
        return response(200, { deleted: orphanFileIds.length });
      }
      if (input.action !== 'temporary-url' || !Array.isArray(input.fileIds)) return response(400, { message: '请求无效' });
      const result = await uniCloud.getTempFileURL({ fileList: input.fileIds.slice(0, 100) });
      return response(200, { urls: (result.fileList || []).filter((item) => item.tempFileURL).map((item) => ({ fileId: item.fileID, url: item.tempFileURL })) });
    }
    return await uploadMedia(event);
  } catch (error) { return response(error.statusCode || 500, { message: error.statusCode ? error.message : '赛事媒体服务暂不可用' }); }
};

'use strict';

const crypto = require('node:crypto');
const Busboy = require('busboy');

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function response(statusCode, body) {
  return {
    mpserverlessComposedResponse: true,
    isBase64Encoded: false,
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

function header(event, name) {
  const headers = event.headers || {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}

function assertSharedSecret(event) {
  const supplied = header(event, 'x-worthrun-avatar-secret');
  if (!process.env.AVATAR_SHARED_SECRET || supplied !== process.env.AVATAR_SHARED_SECRET) {
    throw Object.assign(new Error('认证失败'), { statusCode: 401 });
  }
}

async function callMainApi(path, body) {
  const result = await uniCloud.httpclient.request(`${process.env.MAIN_API_BASE_URL}${path}`, {
    method: 'POST',
    data: body,
    contentType: 'json',
    dataType: 'json',
    headers: {
      'x-worthrun-avatar-secret': process.env.AVATAR_SHARED_SECRET,
    },
    timeout: 8000,
  });
  if (result.status < 200 || result.status >= 300) {
    throw Object.assign(new Error(result.data?.message || '主 API 请求失败'), {
      statusCode: result.status,
    });
  }
  return result.data;
}

function isBase64(event) {
  return event.isBase64Encoded === true || event.isBase64Encoded === 'true';
}

function parseJson(event) {
  if (!event.body) return {};
  const text = isBase64(event)
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  return typeof text === 'string' ? JSON.parse(text) : text;
}

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const contentType = header(event, 'content-type');
    const body = Buffer.from(event.body || '', isBase64(event) ? 'base64' : 'binary');
    const fields = {};
    let file = null;
    let total = 0;
    const parser = Busboy({ headers: { 'content-type': contentType }, limits: { files: 1, fileSize: MAX_FILE_BYTES } });
    parser.on('field', (name, value) => { fields[name] = value; });
    parser.on('file', (_name, stream, info) => {
      const chunks = [];
      stream.on('data', (chunk) => { total += chunk.length; chunks.push(chunk); });
      stream.on('limit', () => reject(Object.assign(new Error('头像不能超过 2MB'), { statusCode: 413 })));
      stream.on('end', () => { file = { buffer: Buffer.concat(chunks), mimeType: info.mimeType, filename: info.filename }; });
    });
    parser.on('error', reject);
    parser.on('finish', () => {
      if (!file || !total) reject(Object.assign(new Error('缺少头像文件'), { statusCode: 400 }));
      else resolve({ fields, file });
    });
    parser.end(body);
  });
}

function matchesMime(buffer, mimeType) {
  if (mimeType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/webp') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

async function upload(event) {
  const { fields, file } = await parseMultipart(event);
  if (!fields.grantId || !fields.token) throw Object.assign(new Error('缺少上传凭证'), { statusCode: 400 });
  if (!ALLOWED_MIME.has(file.mimeType)) throw Object.assign(new Error('仅支持 JPEG、PNG 或 WebP'), { statusCode: 400 });
  if (!matchesMime(file.buffer, file.mimeType)) throw Object.assign(new Error('图片文件格式异常'), { statusCode: 400 });
  const grant = await callMainApi('/api/internal/avatar-upload/authorize', {
    grantId: fields.grantId,
    token: fields.token,
  });
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.mimeType];
  const uploaded = await uniCloud.uploadFile({
    cloudPath: `${grant.objectPath}.${extension}`,
    fileContent: file.buffer,
    cloudPathAsRealPath: true,
  });
  const timestamp = String(Date.now());
  const signature = crypto
    .createHmac('sha256', process.env.AVATAR_SHARED_SECRET)
    .update(`${timestamp}.${fields.grantId}.${uploaded.fileID}`)
    .digest('hex');
  try {
    await callMainApi('/api/internal/avatar-upload/complete', {
      grantId: fields.grantId,
      fileId: uploaded.fileID,
      timestamp,
      signature,
    });
  } catch (error) {
    await uniCloud.deleteFile({ fileList: [uploaded.fileID] }).catch(() => undefined);
    throw error;
  }
  return response(201, { uploaded: true });
}

exports.main = async (event) => {
  try {
    const method = String(event.httpMethod || 'POST').toUpperCase();
    const contentType = header(event, 'content-type');
    if (method === 'DELETE') {
      assertSharedSecret(event);
      const input = parseJson(event);
      if (input.fileId) await uniCloud.deleteFile({ fileList: [input.fileId] });
      return response(200, { deleted: true });
    }
    if (contentType.includes('application/json')) {
      assertSharedSecret(event);
      const input = parseJson(event);
      if (input.action !== 'temporary-url' || !Array.isArray(input.fileIds)) return response(400, { message: '请求无效' });
      const result = await uniCloud.getTempFileURL({ fileList: input.fileIds.slice(0, 100) });
      return response(200, {
        urls: (result.fileList || []).filter((item) => item.tempFileURL).map((item) => ({ fileId: item.fileID, url: item.tempFileURL })),
      });
    }
    return await upload(event);
  } catch (error) {
    return response(error.statusCode || 500, { message: error.statusCode ? error.message : '头像服务暂不可用' });
  }
};

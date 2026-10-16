// 火山引擎 OpenAPI V4 签名（纯函数，便于测试）。
// 规范见官方文档 https://www.volcengine.com/docs/6369/67269
//
// ⚠️ 本文件是 src/main/volcengine-sign.ts 的移植副本（主进程用 axios，插件只需签名本身）。
//    改动时必须同步两边，官方测试向量 src/main/volcengine-sign.test.ts 是防漂移锚点。

import { createHash, createHmac } from 'node:crypto';

export interface SignInput {
  method: 'GET' | 'POST';
  /** 服务地址，如 open.volcengineapi.com */
  host: string;
  region: string;
  /** 服务名，Ark 为 ark */
  service: string;
  action: string;
  version: string;
  /** 额外查询参数（Action / Version / Region 除外） */
  query?: Record<string, string>;
  body?: string;
  accessKey: string;
  secretKey: string;
  /** 请求时间，调用方传入以便测试 */
  date: Date;
}

export interface SignResult {
  headers: Record<string, string>;
  /** 参与签名的查询串，请求 URL 需与之完全一致 */
  canonicalQuery: string;
  canonicalRequest: string;
  stringToSign: string;
  signature: string;
}

const ALGORITHM = 'HMAC-SHA256';
/** 参与签名的请求头（官方 GET 示例的最小集） */
export const SIGNED_HEADERS = 'host;x-date';

/** 空 body 的 SHA256，用于 CanonicalRequest 末行 */
export const EMPTY_PAYLOAD_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function hmacSha256(key: Buffer | string, content: string): Buffer {
  return createHmac('sha256', key).update(content, 'utf8').digest();
}

/** RFC3986 编码：encodeURIComponent 放行的 !'()* 需补转义，空格已是 %20 */
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

/** 查询参数按 key 的 ASCII 升序排序后拼成 canonical 形式 */
export function buildCanonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(params[k])}`)
    .join('&');
}

/** X-Date：UTC 的 YYYYMMDDTHHMMSSZ */
export function formatXDate(date: Date): string {
  return date.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/g, '');
}

/** 由 secret 派生 kSigning：kDate → kRegion → kService → kSigning */
function deriveSigningKey(secretKey: string, date: string, region: string, service: string): Buffer {
  const kDate = hmacSha256(secretKey, date);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'request');
}

export function signVolcengineRequest(input: SignInput): SignResult {
  const { method, host, region, service, accessKey, secretKey, date } = input;
  const xDate = formatXDate(date);
  const shortDate = xDate.slice(0, 8);
  const body = input.body ?? '';
  const payloadHash = body ? sha256Hex(body) : EMPTY_PAYLOAD_SHA256;

  const query = {
    Action: input.action,
    Version: input.version,
    ...(input.query || {}),
  };
  const canonicalQuery = buildCanonicalQuery(query);
  const canonicalHeaders = `host:${host}\nx-date:${xDate}\n`;

  const canonicalRequest = [
    method,
    '/',
    canonicalQuery,
    canonicalHeaders,
    SIGNED_HEADERS,
    payloadHash,
  ].join('\n');

  const credentialScope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = [ALGORITHM, xDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');

  const kSigning = deriveSigningKey(secretKey, shortDate, region, service);
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  return {
    canonicalQuery,
    canonicalRequest,
    stringToSign,
    signature,
    headers: {
      Host: host,
      'X-Date': xDate,
      Authorization:
        `${ALGORITHM} Credential=${accessKey}/${credentialScope}, ` +
        `SignedHeaders=${SIGNED_HEADERS}, Signature=${signature}`,
    },
  };
}

/** 构造与签名一致的请求 URL（查询串复用 canonical 形式） */
export function buildVolcengineUrl(host: string, canonicalQuery: string): string {
  return `https://${host}/?${canonicalQuery}`;
}

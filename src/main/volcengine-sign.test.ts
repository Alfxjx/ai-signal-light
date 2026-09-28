import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import {
  signVolcengineRequest,
  buildCanonicalQuery,
  formatXDate,
  EMPTY_PAYLOAD_SHA256,
  SIGNED_HEADERS,
} from './volcengine-sign';

// 官方文档 https://www.volcengine.com/docs/6369/67269 的 GET 示例测试向量
const AK = 'AKLTYWViMTVmZGYzM2E0NDI5Mzk2MDZjNjFmMjc2MjRjMzg';
const SK = 'WkRZeE1EQmxPVGhsWWpWak5HVmtNbUUxTXpZeU9UVXlOMlE1TmpZeVlqTQ==';
const DOC_DATE = new Date('2025-03-29T18:09:37Z');
const DOC_CANONICAL_HASH = '43171c1658c64b5db55c58d54988a4598d2d09a5613136beaa5eef40eae6e2c1';
const DOC_SIGNATURE = '1eda9e7e6b1728151a8e8791fdaf67cfbd28bd5c80d0fce2eb208746cf483105';

function docRequest() {
  return signVolcengineRequest({
    method: 'GET',
    host: 'billing.volcengineapi.com',
    region: 'cn-beijing',
    service: 'billing',
    action: 'QueryBalanceAcct',
    version: '2022-01-01',
    accessKey: AK,
    secretKey: SK,
    date: DOC_DATE,
  });
}

describe('formatXDate', () => {
  it('输出 UTC 的 YYYYMMDDTHHMMSSZ', () => {
    expect(formatXDate(DOC_DATE)).toBe('20250329T180937Z');
  });
});

describe('buildCanonicalQuery', () => {
  it('按 key 的 ASCII 升序排列', () => {
    expect(buildCanonicalQuery({ Version: 'v', Action: 'a', Region: 'cn-beijing' }))
      .toBe('Action=a&Region=cn-beijing&Version=v');
  });

  it('RFC3986 编码：空格转 %20，中文按 UTF-8 百分号编码', () => {
    expect(buildCanonicalQuery({ 'a b': 'x y' })).toBe('a%20b=x%20y');
    expect(buildCanonicalQuery({ '名': '值' })).toBe('%E5%90%8D=%E5%80%BC');
  });

  it('补转义 encodeURIComponent 放行的 !\'()*', () => {
    expect(buildCanonicalQuery({ "a!b'c(d)e*f": "g!h'i(j)k*l" }))
      .toBe("a%21b%27c%28d%29e%2Af=g%21h%27i%28j%29k%2Al");
  });

  it('连字符 / 下划线 / 点 / 波浪号保持原样（unreserved）', () => {
    expect(buildCanonicalQuery({ 'a-b_c.d~e': 'f-g_h.i~j' })).toBe('a-b_c.d~e=f-g_h.i~j');
  });
});

describe('signVolcengineRequest（官方文档测试向量）', () => {
  it('CanonicalRequest 与文档一致', () => {
    expect(docRequest().canonicalRequest).toBe(
      [
        'GET',
        '/',
        'Action=QueryBalanceAcct&Version=2022-01-01',
        'host:billing.volcengineapi.com',
        'x-date:20250329T180937Z',
        '',
        SIGNED_HEADERS,
        EMPTY_PAYLOAD_SHA256,
      ].join('\n')
    );
  });

  it('CanonicalRequest 的 SHA256 等于文档公布值', () => {
    const hash = createHash('sha256').update(docRequest().canonicalRequest, 'utf8').digest('hex');
    expect(hash).toBe(DOC_CANONICAL_HASH);
  });

  it('签名等于文档公布值', () => {
    expect(docRequest().signature).toBe(DOC_SIGNATURE);
  });

  it('StringToSign 为四行结构', () => {
    expect(docRequest().stringToSign).toBe(
      [
        'HMAC-SHA256',
        '20250329T180937Z',
        '20250329/cn-beijing/billing/request',
        DOC_CANONICAL_HASH,
      ].join('\n')
    );
  });

  it('Authorization 头格式与文档一致', () => {
    expect(docRequest().headers).toEqual({
      Host: 'billing.volcengineapi.com',
      'X-Date': '20250329T180937Z',
      Authorization:
        `HMAC-SHA256 Credential=${AK}/20250329/cn-beijing/billing/request, ` +
        `SignedHeaders=host;x-date, Signature=${DOC_SIGNATURE}`,
    });
  });

  it('时间不同则签名不同（签名确实绑定了 X-Date）', () => {
    const later = signVolcengineRequest({
      method: 'GET',
      host: 'billing.volcengineapi.com',
      region: 'cn-beijing',
      service: 'billing',
      action: 'QueryBalanceAcct',
      version: '2022-01-01',
      accessKey: AK,
      secretKey: SK,
      date: new Date('2025-03-29T18:09:38Z'),
    });
    expect(later.signature).not.toBe(DOC_SIGNATURE);
  });

  it('Coding Plan 额度查询：附加 Region 后仍能稳定签名', () => {
    const signed = signVolcengineRequest({
      method: 'GET',
      host: 'open.volcengineapi.com',
      region: 'cn-beijing',
      service: 'ark',
      action: 'GetCodingPlanUsage',
      version: '2024-01-01',
      query: { Region: 'cn-beijing' },
      accessKey: AK,
      secretKey: SK,
      date: DOC_DATE,
    });
    // 查询串按 ASCII 升序：Action < Region < Version
    expect(signed.canonicalRequest.split('\n')[2]).toBe(
      'Action=GetCodingPlanUsage&Region=cn-beijing&Version=2024-01-01'
    );
    expect(signed.headers.Authorization).toContain(
      'Credential=' + AK + '/20250329/cn-beijing/ark/request'
    );
    expect(signed.signature).toMatch(/^[0-9a-f]{64}$/);
  });
});

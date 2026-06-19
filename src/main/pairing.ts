/**
 * 生成手机端配对用的二维码数据。
 * 用户选择“完整明文配置”方案，二维码直接包含 Token/Cookie，
 * 因此二维码窗口需提示“请勿截图分享”。
 */

import os from 'os';
import crypto from 'crypto';
import type { AppConfig } from '../shared/types/config';
import { WS_PORT } from '../shared/constants';

export interface QrPayload {
  v: number;
  host: string;
  port: number;
  apiKey: string;
  config: AppConfig;
}

/** 生成一个随机的 32 字节 hex apiKey */
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** 获取本机局域网 IP（优先非虚拟网卡） */
export function getLanIp(): string | null {
  const interfaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    // 跳过虚拟/VMware/Hyper-V 常见网卡
    if (/^(vEthernet|VMware|VirtualBox|veth|docker|br-|lo)/i.test(name)) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal && addr.address) {
        return addr.address;
      }
    }
  }
  return null;
}

/** 构建二维码 payload */
export function buildQrPayload(config: AppConfig, apiKey: string): QrPayload {
  const host = getLanIp() || '127.0.0.1';
  return {
    v: 1,
    host,
    port: WS_PORT,
    apiKey,
    config
  };
}

/** 把 payload 序列化为二维码要编码的字符串 */
export function encodeQrPayload(payload: QrPayload): string {
  return JSON.stringify(payload);
}

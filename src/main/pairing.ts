/**
 * 生成手机端配对用的二维码数据。
 *
 * 只携带最小信息：版本号、host、port、apiKey。完整配置不再随二维码下发，
 * 手机端扫码后用 apiKey 走 WebSocket 反向拉取（见 server.ts 的 getConfig 处理器）。
 */

import os from 'os';
import crypto from 'crypto';
import type { AppConfig, MobileAppConfig } from '../shared/types/config';
import { WS_PORT } from '../shared/constants';

export interface QrPayload {
  v: number;
  host: string;
  port: number;
  apiKey: string;
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
export function buildQrPayload(_config: AppConfig, apiKey: string): QrPayload {
  const host = getLanIp() || '127.0.0.1';
  return {
    v: 1,
    host,
    port: WS_PORT,
    apiKey
  };
}

/** 把 payload 序列化为二维码要编码的字符串 */
export function encodeQrPayload(payload: QrPayload): string {
  return JSON.stringify(payload);
}

/** 投影到移动端订阅的精简配置，去掉 window/hooks/floatingBall/lanMode 等桌面专属字段 */
export function toMobileConfig(config: AppConfig): MobileAppConfig {
  return {
    kimi: { ...config.kimi },
    minimax: { ...config.minimax },
    copilot: { ...config.copilot },
    proxy: { ...config.proxy },
    intervalMinutes: config.intervalMinutes,
    thresholds: { ...config.thresholds }
  };
}

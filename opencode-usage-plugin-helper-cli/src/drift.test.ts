// 防漂移：CLI 里的 configPath() 是插件那份逻辑的**副本**（原因见 paths.ts 顶部）。
// 这个测试直接 import 插件的实现，断言两边永远一致 —— 插件那边改了路径逻辑而
// CLI 没跟上时，这里立刻红。

import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { configPath as cliConfigPath } from './paths';
import { displayWidth as cliDisplayWidth } from './ui';
import { configPath as pluginConfigPath } from '../../opencode-plugin/src/config';
import { PROVIDERS, type ProviderId } from './providers';
import { enabledProviders } from '../../opencode-plugin/src/providers/index';

const originalAppData = process.env.APPDATA;

afterEach(() => {
  if (originalAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = originalAppData;
});

describe('configPath 与插件实现一致', () => {
  it('APPDATA 存在时两边相同', () => {
    process.env.APPDATA = String.raw`C:\Users\test\AppData\Roaming`;
    expect(cliConfigPath()).toBe(pluginConfigPath());
  });

  it('APPDATA 为空时两边都回退到 homedir（macOS/Linux 场景）', () => {
    process.env.APPDATA = '';
    expect(cliConfigPath()).toBe(pluginConfigPath());
    expect(cliConfigPath()).toContain('AI状态监控');
  });

  it('APPDATA 未定义时两边相同', () => {
    delete process.env.APPDATA;
    expect(cliConfigPath()).toBe(pluginConfigPath());
  });

  it('APPDATA 只有空白时按未设置处理，两边相同', () => {
    process.env.APPDATA = '   ';
    expect(cliConfigPath()).toBe(pluginConfigPath());
  });

  it('末尾始终是 AI状态监控/config.json', () => {
    expect(cliConfigPath().endsWith(join('AI状态监控', 'config.json'))).toBe(true);
  });
});

describe('显示宽度与插件实现一致', () => {
  it('CLI 的 displayWidth 与插件那份对同一批字符结果相同', async () => {
    const { displayWidth: pluginWidth } = await import('../../opencode-plugin/src/format');
    for (const s of ['Kimi', '火山', '插件转发文件', 'node_modules', 'AI状态监控', '···', '']) {
      expect(cliDisplayWidth(s)).toBe(pluginWidth(s));
    }
  });
});

describe('provider 集合与插件一致', () => {
  /** 造一个把某家打开的配置，看插件认不认 */
  function enabledIds(ids: ProviderId[]): string[] {
    const config: Record<string, unknown> = {};
    for (const id of ids) config[id] = { enabled: true };
    return enabledProviders(config as never).map((p) => p.id);
  }

  it('CLI 的每一家，插件都认（字段名没写错）', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(enabledIds(ids).sort()).toEqual([...ids].sort());
  });

  it('CLI 写出的凭据字段能被插件的 provider 读到', () => {
    // 插件的 fetchOne 会用 definition.fetch(config) 拿凭据。
    // 这里不发网络请求，只验证 config 的形状对得上：
    // 插件侧 RawProviderConfig.token / RawVolcengineConfig.accessKey|secretKey
    const config = {
      kimi: { token: 'x', enabled: true },
      volcengine: { accessKey: 'ak', secretKey: 'sk', enabled: true },
    };
    // 插件的 loadConfig 能解析且 enabledProviders 能挑出来
    expect(enabledProviders(config as never).map((p) => p.id)).toEqual(['kimi', 'volcengine']);
  });
});

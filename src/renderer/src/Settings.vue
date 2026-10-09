<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { SettingsSavePayload, PetMeta } from './types/electron';
import { DEFAULT_USAGE_THRESHOLDS } from './types/messages';
import { parseInput, fetchPet } from './pet/pet-install';

interface ProviderState {
  enabled: boolean;
  token: string;
  tokenChanged: boolean;
  hasToken: boolean;
  showToken: boolean;
  useProxy: boolean;
}

function makeProvider(): ProviderState {
  return {
    enabled: false,
    token: '',
    tokenChanged: false,
    hasToken: false,
    showToken: false,
    useProxy: false,
  };
}

const kimi = reactive<ProviderState>(makeProvider());
const minimax = reactive<ProviderState>(makeProvider());
const copilot = reactive<ProviderState>(makeProvider());
const deepseek = reactive<ProviderState>(makeProvider());
const mimo = reactive<ProviderState>(makeProvider());
const codexEnabled = ref<boolean>(false);
const codexUseProxy = ref<boolean>(false);
const codexAutoAvailable = ref<boolean>(false);

const volcengineAccessKey = ref<string>('');
const volcengineSecretKey = ref<string>('');
const volcengineEnabled = ref<boolean>(false);
const volcengineUseProxy = ref<boolean>(false);
const volcengineAccessKeyChanged = ref<boolean>(false);
const volcengineSecretKeyChanged = ref<boolean>(false);
const volcengineHasAccessKey = ref<boolean>(false);
const volcengineHasSecretKey = ref<boolean>(false);
const volcengineShowAccessKey = ref<boolean>(false);
const volcengineShowSecretKey = ref<boolean>(false);

const copilotOAuth = ref<boolean>(false);
const deviceFlowBusy = ref<boolean>(false);
const deviceUserCode = ref<string>('');
const deviceStatus = ref<string>('');

async function startCopilotDeviceFlow() {
  if (!window.electronAPI) return;
  deviceFlowBusy.value = true;
  deviceStatus.value = '';
  deviceUserCode.value = '';
  const r = await window.electronAPI.copilotStartDeviceFlow();
  if (r.success && r.userCode) {
    deviceUserCode.value = r.userCode;
    deviceStatus.value = '已在浏览器打开授权页，请输入上方验证码';
  } else {
    deviceFlowBusy.value = false;
    deviceStatus.value = '发起失败: ' + (r.error || '未知错误');
  }
}

async function cancelCopilotDeviceFlow() {
  if (!window.electronAPI) return;
  await window.electronAPI.copilotCancelDeviceFlow();
  deviceFlowBusy.value = false;
  deviceUserCode.value = '';
  deviceStatus.value = '已取消';
}
const proxyUrl = ref<string>('');
const proxyUrlChanged = ref<boolean>(false);
const hasProxy = ref<boolean>(false);
const intervalMinutes = ref<number>(10);
const saving = ref<boolean>(false);
const floatingBallEnabled = ref<boolean>(false);
const lanModeEnabled = ref<boolean>(false);

// ---- 桌面宠物 ----
const petEnabled = ref<boolean>(false);
const petScale = ref<number>(100);
const petLibrary = ref<PetMeta[]>([]);
const petActiveId = ref<string>('');
const petShowInstall = ref<boolean>(false);
const petInstallInput = ref<string>('');
const petInstallBusy = ref<boolean>(false);
const petInstallStatus = ref<string>('');

const PET_SCALE_MIN = 50;
const PET_SCALE_MAX = 150;
const PET_SCALE_STEP = 10;

async function refreshPetLibrary(): Promise<void> {
  if (!window.electronAPI?.pet) return;
  petLibrary.value = await window.electronAPI.pet.list();
  const r = await window.electronAPI.pet.get();
  petActiveId.value = r.pet?.id ?? '';
  petScale.value = r.scale;
}

function applyPetScale(value: number): void {
  const next = Math.min(PET_SCALE_MAX, Math.max(PET_SCALE_MIN, Math.round(value)));
  if (next === petScale.value) return;
  petScale.value = next;
  window.electronAPI?.pet?.setScale(next);
}

async function onPetInstall(): Promise<void> {
  if (!window.electronAPI?.pet) return;
  petInstallBusy.value = true;
  petInstallStatus.value = '下载中…';
  try {
    const plan = parseInput(petInstallInput.value);
    const { dataUrl, info } = await fetchPet(plan);
    await window.electronAPI.pet.install({
      name: info.name,
      author: info.author,
      source: info.source,
      dataUrl,
    });
    petInstallInput.value = '';
    petShowInstall.value = false;
    petInstallStatus.value = '安装成功，已切换为新宠物';
    await refreshPetLibrary();
  } catch (e) {
    petInstallStatus.value = '安装失败：' + (e instanceof Error ? e.message : String(e));
  } finally {
    petInstallBusy.value = false;
  }
}

async function onPetSwitch(id: string): Promise<void> {
  if (!window.electronAPI?.pet) return;
  await window.electronAPI.pet.setActive(id);
  await refreshPetLibrary();
}

async function onPetRemove(id: string): Promise<void> {
  if (!window.electronAPI?.pet) return;
  await window.electronAPI.pet.remove(id);
  await refreshPetLibrary();
}

// ---- 用量阈值 ----
const warnThreshold = ref<number>(DEFAULT_USAGE_THRESHOLDS.warn);
const dangerThreshold = ref<number>(DEFAULT_USAGE_THRESHOLDS.danger);
const thresholdError = ref<string>('');

const thresholdsValid = computed<boolean>(() =>
  Number.isInteger(warnThreshold.value) &&
  Number.isInteger(dangerThreshold.value) &&
  warnThreshold.value >= 0 && warnThreshold.value <= 99 &&
  dangerThreshold.value >= 1 && dangerThreshold.value <= 100 &&
  warnThreshold.value < dangerThreshold.value
);

function validateThresholds(): void {
  if (thresholdsValid.value) {
    thresholdError.value = '';
    return;
  }
  if (warnThreshold.value >= dangerThreshold.value) {
    thresholdError.value = 'warn 必须小于 danger';
  } else if (warnThreshold.value < 0 || warnThreshold.value > 99) {
    thresholdError.value = 'warn 必须在 0–99 之间';
  } else if (dangerThreshold.value < 1 || dangerThreshold.value > 100) {
    thresholdError.value = 'danger 必须在 1–100 之间';
  } else {
    thresholdError.value = '请输入整数';
  }
}

// ---- Claude Code hooks ----
const hookEnabled = reactive<{ Notification: boolean; Stop: boolean; PreToolUse: boolean }>({
  Notification: true,
  Stop: true,
  PreToolUse: true,
});
const hookHelperPath = ref<string>('');     // 主进程挂载时给一次
const hookAutoInstalled = ref<boolean>(false);
const hookBusy = ref<boolean>(false);
const hookStatus = ref<string>('');
const copyStatus = ref<string>('');

// snippet 完全在 renderer 计算，勾选变化自动响应（不走 IPC，避免 reactive 序列化与 HMR 死角）
const hookSnippet = computed<string>(() => {
  if (!hookHelperPath.value) return '';
  const cmd = `node ${JSON.stringify(hookHelperPath.value)}`;
  const entry = { matcher: '', hooks: [{ type: 'command', command: cmd }] };
  const hooks: Record<string, unknown[]> = {};
  if (hookEnabled.Notification) hooks.Notification = [entry];
  if (hookEnabled.Stop)         hooks.Stop = [entry];
  if (hookEnabled.PreToolUse)   hooks.PreToolUse = [entry];
  return JSON.stringify({ hooks }, null, 2);
});

async function refreshHelperPath() {
  if (!window.electronAPI) return;
  const snap = await window.electronAPI.getHooksSnippet();
  if (snap) {
    hookHelperPath.value = snap.helperPath;
    hookAutoInstalled.value = snap.autoInstalled;
  }
}

async function copySnippet() {
  if (!hookSnippet.value) return;
  try {
    await navigator.clipboard.writeText(hookSnippet.value);
    copyStatus.value = '已复制';
  } catch (e) {
    copyStatus.value = '复制失败';
  }
  setTimeout(() => { copyStatus.value = ''; }, 1500);
}

async function onAutoInstallToggle(ev: Event) {
  if (!window.electronAPI) return;
  const target = ev.target as HTMLInputElement;
  const checked = target.checked;
  hookBusy.value = true;
  hookStatus.value = '';
  try {
    if (checked) {
      const r = await window.electronAPI.installHooks();
      if (r.success) {
        hookAutoInstalled.value = true;
        const ins = r.installed?.length ?? 0;
        const skp = r.skipped?.length ?? 0;
        hookStatus.value = `已安装 ${ins} 项${skp ? `（跳过 ${skp} 项已存在）` : ''}`;
      } else {
        target.checked = false;
        hookStatus.value = '失败: ' + (r.error || '未知错误');
      }
    } else {
      const r = await window.electronAPI.uninstallHooks();
      if (r.success) {
        hookAutoInstalled.value = false;
        hookStatus.value = `已卸载 ${r.removed ?? 0} 项`;
      } else {
        target.checked = true;
        hookStatus.value = '卸载失败: ' + (r.error || '未知错误');
      }
    }
  } finally {
    hookBusy.value = false;
  }
}

onMounted(async () => {
  if (!window.electronAPI) {
    console.error('electronAPI not available');
    return;
  }

  const cfg = await window.electronAPI.getSettings();
  if (!cfg) return;

  kimi.enabled = !!cfg.kimi.enabled;
  kimi.useProxy = !!cfg.kimi.useProxy;
  kimi.token = cfg.hasKimiToken ? (cfg.kimi.token || '') : '';
  kimi.hasToken = !!cfg.hasKimiToken;
  minimax.enabled = !!cfg.minimax.enabled;
  minimax.useProxy = !!cfg.minimax.useProxy;
  minimax.token = cfg.hasMiniMaxToken ? (cfg.minimax.token || '') : '';
  minimax.hasToken = !!cfg.hasMiniMaxToken;

  copilot.enabled = !!cfg.copilot.enabled;
  copilot.useProxy = !!cfg.copilot.useProxy;
  copilot.token = cfg.hasCopilotToken ? (cfg.copilot.token || '') : '';
  copilot.hasToken = !!cfg.hasCopilotToken;
  copilotOAuth.value = !!cfg.copilotOAuth;

  deepseek.enabled = !!cfg.deepseek.enabled;
  deepseek.useProxy = !!cfg.deepseek.useProxy;
  deepseek.token = cfg.hasDeepseekToken ? (cfg.deepseek.token || '') : '';
  deepseek.hasToken = !!cfg.hasDeepseekToken;

  mimo.enabled = !!cfg.mimo?.enabled;
  mimo.useProxy = !!cfg.mimo?.useProxy;
  mimo.token = cfg.hasMimoCookie ? (cfg.mimo?.token || '') : '';
  mimo.hasToken = !!cfg.hasMimoCookie;

  codexEnabled.value = !!cfg.codex?.enabled;
  codexUseProxy.value = !!cfg.codex?.useProxy;
  codexAutoAvailable.value = !!cfg.codexAutoAvailable;

  volcengineEnabled.value = !!cfg.volcengine?.enabled;
  volcengineUseProxy.value = !!cfg.volcengine?.useProxy;
  volcengineAccessKey.value = cfg.hasVolcengineAccessKey ? (cfg.volcengine?.accessKey || '') : '';
  volcengineSecretKey.value = cfg.hasVolcengineSecretKey ? (cfg.volcengine?.secretKey || '') : '';
volcengineAccessKeyChanged.value = false;
  volcengineSecretKeyChanged.value = false;
  volcengineHasAccessKey.value = !!cfg.hasVolcengineAccessKey;
  volcengineHasSecretKey.value = !!cfg.hasVolcengineSecretKey;

  proxyUrl.value = cfg.hasProxy ? (cfg.proxy?.url || '') : '';
  hasProxy.value = !!cfg.hasProxy;

  intervalMinutes.value = cfg.intervalMinutes || 10;

  if (cfg.hooks?.enabled) {
    hookEnabled.Notification = !!cfg.hooks.enabled.Notification;
    hookEnabled.Stop = !!cfg.hooks.enabled.Stop;
    hookEnabled.PreToolUse = !!cfg.hooks.enabled.PreToolUse;
  }
  hookAutoInstalled.value = !!cfg.hooks?.endpoint?.autoInstalled;
  floatingBallEnabled.value = !!cfg.floatingBall?.enabled;
  petEnabled.value = !!cfg.pet?.enabled;
  lanModeEnabled.value = !!cfg.lanMode?.enabled;
  if (cfg.thresholds) {
    warnThreshold.value = cfg.thresholds.warn;
    dangerThreshold.value = cfg.thresholds.danger;
  }
  await refreshHelperPath();
  await refreshPetLibrary();

  window.electronAPI.onCopilotDeviceResult((r) => {
    deviceFlowBusy.value = false;
    deviceUserCode.value = '';
    if (r.success) {
      copilotOAuth.value = true;
      copilot.hasToken = true;
      deviceStatus.value = '已连接 GitHub 账号，保存后生效';
    } else {
      deviceStatus.value = '授权失败: ' + (r.error || '未知错误');
    }
  });
});

async function onSave() {
  if (!window.electronAPI) return;

  saving.value = true;
  try {
    const payload: SettingsSavePayload = {
      kimi: {
        token: kimi.token.trim(),
        tokenChanged: kimi.tokenChanged,
        enabled: kimi.enabled,
        useProxy: kimi.useProxy,
      },
      minimax: {
        token: minimax.token.trim(),
        tokenChanged: minimax.tokenChanged,
        enabled: minimax.enabled,
        useProxy: minimax.useProxy,
      },
      copilot: {
        token: copilot.token.trim(),
        tokenChanged: copilot.tokenChanged,
        enabled: copilot.enabled,
        useProxy: copilot.useProxy,
      },
      deepseek: {
        token: deepseek.token.trim(),
        tokenChanged: deepseek.tokenChanged,
        enabled: deepseek.enabled,
        useProxy: deepseek.useProxy,
      },
      codex: { enabled: codexEnabled.value, useProxy: codexUseProxy.value },
      mimo: {
        token: mimo.token.trim(),
        tokenChanged: mimo.tokenChanged,
        enabled: mimo.enabled,
        useProxy: mimo.useProxy,
      },
      volcengine: {
        accessKey: volcengineAccessKey.value.trim(),
        accessKeyChanged: volcengineAccessKeyChanged.value,
        secretKey: volcengineSecretKey.value.trim(),
        secretKeyChanged: volcengineSecretKeyChanged.value,
enabled: volcengineEnabled.value,
        useProxy: volcengineUseProxy.value,
      },
      proxy: {
        url: proxyUrl.value.trim(),
        urlChanged: proxyUrlChanged.value,
      },
      intervalMinutes: intervalMinutes.value,
      hooks: { enabled: { ...hookEnabled } },
      floatingBall: { enabled: floatingBallEnabled.value },
      pet: { enabled: petEnabled.value },
      thresholds: {
        warn: warnThreshold.value,
        danger: dangerThreshold.value,
      },
      lanMode: { enabled: lanModeEnabled.value },
    };
    await window.electronAPI.saveSettings(payload);
    onCancel();
  } catch (e) {
    console.error('save failed:', e);
    const msg = e instanceof Error ? e.message : String(e);
    alert('保存失败: ' + msg);
    saving.value = false;
  }
}

function onCancel() {
  if (window.electronAPI) {
    window.electronAPI.closeSettings();
  } else {
    window.close();
  }
}

async function openQrCode() {
  if (!window.electronAPI) return;
  await window.electronAPI.openQrWindow();
}
</script>

<template>
  <div class="settings">
    <div class="settings-header">
      <span class="settings-title">用量监控设置</span>
      <button class="btn-close" title="关闭" @click="onCancel">×</button>
    </div>

    <div class="settings-body">
      <!-- 全局代理 -->
      <div class="settings-section" data-section="proxy">
        <div class="settings-section-header">
          <span class="settings-section-title">代理设置</span>
        </div>
        <div class="settings-field">
          <label class="settings-label" for="proxyUrl">代理地址</label>
          <input
            id="proxyUrl"
            class="settings-input"
            v-model="proxyUrl"
            :placeholder="hasProxy ? '留空保持原值' : '如 http://127.0.0.1:7890'"
            autocomplete="off"
            spellcheck="false"
            @input="proxyUrlChanged = true"
          >
        </div>
      </div>

      <!-- Kimi -->
      <div class="settings-section" data-provider="kimi">
        <div class="settings-section-header">
          <span class="settings-section-title">Kimi</span>
          <label class="settings-toggle">
            <input type="checkbox" v-model="kimi.enabled">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-field">
          <label class="settings-toggle-label">
            <input type="checkbox" v-model="kimi.useProxy">
            <span>使用代理</span>
          </label>
        </div>
        <div class="settings-field">
          <label class="settings-label" for="kimiToken">API Key</label>
          <div class="settings-input-wrap">
            <input
              :type="kimi.showToken ? 'text' : 'password'"
              id="kimiToken"
              class="settings-input"
              v-model="kimi.token"
              :placeholder="kimi.hasToken ? '留空保持原值' : '粘贴 Kimi 开放平台 API Key'"
              autocomplete="off"
              spellcheck="false"
              @input="kimi.tokenChanged = true"
            >
            <button type="button" class="btn-toggle-visibility" title="显示/隐藏" @click="kimi.showToken = !kimi.showToken">
              {{ kimi.showToken ? '🔒' : '👁' }}
            </button>
          </div>
          <div class="settings-hint">
            在开放平台（platform.kimi.com）创建 API Key，粘贴到上方，用于查询 Coding 套餐用量。
          </div>
        </div>
      </div>

      <!-- MiniMax -->
      <div class="settings-section" data-provider="minimax">
        <div class="settings-section-header">
          <span class="settings-section-title">MiniMax</span>
          <label class="settings-toggle">
            <input type="checkbox" v-model="minimax.enabled">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-field">
          <label class="settings-toggle-label">
            <input type="checkbox" v-model="minimax.useProxy">
            <span>使用代理</span>
          </label>
        </div>
        <div class="settings-field">
          <label class="settings-label" for="minimaxToken">Bearer Token</label>
          <div class="settings-input-wrap">
            <input
              :type="minimax.showToken ? 'text' : 'password'"
              id="minimaxToken"
              class="settings-input"
              v-model="minimax.token"
              :placeholder="minimax.hasToken ? '留空保持原值' : '粘贴 Bearer Token'"
              autocomplete="off"
              spellcheck="false"
              @input="minimax.tokenChanged = true"
            >
            <button type="button" class="btn-toggle-visibility" title="显示/隐藏" @click="minimax.showToken = !minimax.showToken">
              {{ minimax.showToken ? '🔒' : '👁' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Copilot -->
      <div class="settings-section" data-provider="copilot">
        <div class="settings-section-header">
          <span class="settings-section-title">Copilot</span>
          <label class="settings-toggle">
            <input type="checkbox" v-model="copilot.enabled">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-field">
          <label class="settings-toggle-label">
            <input type="checkbox" v-model="copilot.useProxy">
            <span>使用代理</span>
          </label>
        </div>
        <div class="settings-field">
          <label class="settings-label">GitHub 账号授权（推荐）</label>
          <div class="settings-row">
            <button type="button" class="btn-secondary" :disabled="deviceFlowBusy" @click="startCopilotDeviceFlow">
              {{ deviceFlowBusy ? '等待授权中...' : (copilotOAuth ? '重新连接 GitHub' : '连接 GitHub') }}
            </button>
            <button type="button" class="btn-secondary" v-if="deviceFlowBusy" @click="cancelCopilotDeviceFlow">取消</button>
          </div>
          <div class="settings-hint" v-if="deviceUserCode" style="font-size: 16px; letter-spacing: 2px;">
            验证码：<strong>{{ deviceUserCode }}</strong>
          </div>
          <div class="settings-hint" v-if="deviceStatus">{{ deviceStatus }}</div>
          <div class="settings-hint" v-else-if="copilotOAuth">已通过 GitHub OAuth 连接（保存后覆盖旧 Cookie）。</div>
        </div>
        <div class="settings-field">
          <label class="settings-label" for="copilotToken">Cookie（备选，优先使用上方授权）</label>
          <div class="settings-input-wrap">
            <input
              :type="copilot.showToken ? 'text' : 'password'"
              id="copilotToken"
              class="settings-input"
              v-model="copilot.token"
              :placeholder="copilot.hasToken ? '留空保持原值' : '粘贴整段浏览器 Cookie'"
              autocomplete="off"
              spellcheck="false"
              @input="copilot.tokenChanged = true"
            >
            <button type="button" class="btn-toggle-visibility" title="显示/隐藏" @click="copilot.showToken = !copilot.showToken">
              {{ copilot.showToken ? '🔒' : '👁' }}
            </button>
          </div>
        </div>
      </div>

      <!-- DeepSeek -->
      <div class="settings-section" data-provider="deepseek">
        <div class="settings-section-header">
          <span class="settings-section-title">DeepSeek</span>
          <label class="settings-toggle">
            <input type="checkbox" v-model="deepseek.enabled">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-field">
          <label class="settings-toggle-label">
            <input type="checkbox" v-model="deepseek.useProxy">
            <span>使用代理</span>
          </label>
        </div>
        <div class="settings-field">
          <label class="settings-label" for="deepseekToken">API Key</label>
          <div class="settings-input-wrap">
            <input
              :type="deepseek.showToken ? 'text' : 'password'"
              id="deepseekToken"
              class="settings-input"
              v-model="deepseek.token"
              :placeholder="deepseek.hasToken ? '留空保持原值' : '粘贴 platform.deepseek.com 的 API Key'"
              autocomplete="off"
              spellcheck="false"
              @input="deepseek.tokenChanged = true"
            >
            <button type="button" class="btn-toggle-visibility" title="显示/隐藏" @click="deepseek.showToken = !deepseek.showToken">
              {{ deepseek.showToken ? '🔒' : '👁' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Codex -->
      <div class="settings-section" data-provider="codex">
        <div class="settings-section-header">
          <span class="settings-section-title">Codex</span>
          <label class="settings-toggle">
            <input type="checkbox" v-model="codexEnabled">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-field">
          <label class="settings-toggle-label">
            <input type="checkbox" v-model="codexUseProxy">
            <span>使用代理</span>
          </label>
        </div>
        <div class="settings-field">
          <div class="settings-hint" v-if="codexAutoAvailable">已检测到本机 Codex CLI 登录（~/.codex/auth.json），自动读取，无需配置。</div>
          <div class="settings-hint" v-else>未检测到本机 Codex CLI 登录。请先安装并登录 Codex CLI（~/.codex/auth.json）。</div>
        </div>
      </div>

      <!-- 火山引擎 Ark Coding Plan -->
      <div class="settings-section" data-provider="volcengine">
        <div class="settings-section-header">
          <span class="settings-section-title">火山引擎 (Ark Coding Plan)</span>
          <label class="settings-toggle">
            <input type="checkbox" v-model="volcengineEnabled">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-field">
          <label class="settings-toggle-label">
            <input type="checkbox" v-model="volcengineUseProxy">
            <span>使用代理</span>
          </label>
        </div>
        <div class="settings-field">
          <label class="settings-label" for="volcengineAccessKey">Access Key ID</label>
          <div class="settings-input-wrap">
            <input
              :type="volcengineShowAccessKey ? 'text' : 'password'"
              id="volcengineAccessKey"
              class="settings-input"
              v-model="volcengineAccessKey"
              :placeholder="volcengineHasAccessKey ? '留空保持原值' : 'AKLT...'"
              autocomplete="off" spellcheck="false"
              @input="volcengineAccessKeyChanged = true"
            >
            <button type="button" class="btn-toggle-visibility" title="显示/隐藏" @click="volcengineShowAccessKey = !volcengineShowAccessKey">
              {{ volcengineShowAccessKey ? '🔒' : '👁' }}
            </button>
          </div>
        </div>
        <div class="settings-field">
          <label class="settings-label" for="volcengineSecretKey">Secret Access Key</label>
          <div class="settings-input-wrap">
            <input
              :type="volcengineShowSecretKey ? 'text' : 'password'"
              id="volcengineSecretKey"
              class="settings-input"
              v-model="volcengineSecretKey"
              :placeholder="volcengineHasSecretKey ? '留空保持原值' : '粘贴 Secret Access Key'"
              autocomplete="off" spellcheck="false"
              @input="volcengineSecretKeyChanged = true"
            >
            <button type="button" class="btn-toggle-visibility" title="显示/隐藏" @click="volcengineShowSecretKey = !volcengineShowSecretKey">
              {{ volcengineShowSecretKey ? '🔒' : '👁' }}
            </button>
          </div>
          <div class="settings-hint">
在 console.volcengine.com/iam/keymanage/ 创建访问密钥（区域 cn-beijing）。AK/SK 长期有效，无需再维护 Cookie。
          </div>
        </div>
      </div>

      <!-- 小米 MiMo -->
      <div class="settings-section" data-provider="mimo">
        <div class="settings-section-header">
          <span class="settings-section-title">小米 MiMo</span>
          <label class="settings-toggle">
            <input type="checkbox" v-model="mimo.enabled">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-field">
          <label class="settings-toggle-label">
            <input type="checkbox" v-model="mimo.useProxy">
            <span>使用代理</span>
          </label>
        </div>
        <div class="settings-field">
          <label class="settings-label" for="mimoCookie">控制台 Cookie</label>
          <div class="settings-input-wrap">
            <input
              :type="mimo.showToken ? 'text' : 'password'"
              id="mimoCookie"
              class="settings-input"
              v-model="mimo.token"
              :placeholder="mimo.hasToken ? '留空保持原值' : '粘贴整段 Cookie'"
              autocomplete="off"
              spellcheck="false"
              @input="mimo.tokenChanged = true"
            >
            <button type="button" class="btn-toggle-visibility" title="显示/隐藏" @click="mimo.showToken = !mimo.showToken">
              {{ mimo.showToken ? '🔒' : '👁' }}
            </button>
          </div>
          <div class="settings-hint">
            MiMo 余额只由网页控制台接口暴露，调模型的 <code>sk-</code> API Key 查不到。
            打开 <code>platform.xiaomimimo.com/#/console/balance</code> → F12 → Network → 刷新 →
            找到 <code>api/v1/balance</code> 请求 → 复制整段 <code>Cookie</code> 请求头
            （需含 <code>api-platform_serviceToken</code> 与 <code>userId</code>）。会话过期后需重新粘贴。
          </div>
        </div>
      </div>

      <!-- 刷新周期 -->
      <div class="settings-field">
        <label class="settings-label" for="interval">刷新周期</label>
        <select id="interval" class="settings-select" v-model.number="intervalMinutes">
          <option :value="5">5 分钟</option>
          <option :value="10">10 分钟</option>
          <option :value="15">15 分钟</option>
          <option :value="30">30 分钟</option>
          <option :value="60">60 分钟</option>
        </select>
      </div>

      <!-- 用量阈值 -->
      <div class="settings-section" data-section="thresholds">
        <div class="settings-section-header">
          <span class="settings-section-title">用量阈值</span>
        </div>
        <div class="settings-field">
          <label class="settings-label">进度条颜色切换点（已用 %）</label>
          <div class="settings-row">
            <label class="settings-label-inline" for="warnThreshold">warn</label>
            <input
              id="warnThreshold"
              type="number"
              class="settings-input settings-input--narrow"
              min="0" max="99" step="1"
              v-model.number="warnThreshold"
              @input="validateThresholds"
            >
            <label class="settings-label-inline" for="dangerThreshold">danger</label>
            <input
              id="dangerThreshold"
              type="number"
              class="settings-input settings-input--narrow"
              min="1" max="100" step="1"
              v-model.number="dangerThreshold"
              @input="validateThresholds"
            >
          </div>
          <div class="settings-hint" v-if="thresholdError">{{ thresholdError }}</div>
          <div class="settings-hint" v-else>已用 % 超过 danger 变红，超过 warn 变黄，否则绿。warn 必须小于 danger。</div>
        </div>
      </div>

      <!-- 悬浮球 -->
      <div class="settings-section" data-section="floating-ball">
        <div class="settings-section-header">
          <span class="settings-section-title">悬浮球</span>
          <label class="settings-toggle">
            <input type="checkbox" v-model="floatingBallEnabled">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-field">
          <div class="settings-hint">桌面右下角常驻 80×80 状态指示器：中心 5h 剩余百分比、底部多模型 mini bar、有通知时顶部亮红点。单击切到主窗口，可拖动改位置。</div>
        </div>
      </div>

      <!-- 桌面宠物 -->
      <div class="settings-section" data-section="pet">
        <div class="settings-section-header">
          <span class="settings-section-title">桌面宠物</span>
          <label class="settings-toggle">
            <input type="checkbox" v-model="petEnabled">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-field">
          <div class="settings-hint">养一只像素宠物，跟随 Kimi 工作状态变换动作。单击打开 Kimi Web，长按看用量，右键菜单，可拖动。</div>
        </div>

        <div class="settings-field">
          <div class="settings-label">我的宠物</div>
          <div v-if="petLibrary.length === 0" class="settings-hint">尚未安装宠物</div>
          <div v-for="p in petLibrary" :key="p.id" class="settings-row pet-row">
            <span class="settings-label-inline pet-name" :title="p.author ? `${p.name} by ${p.author}` : p.name">
              {{ p.name }}<template v-if="p.author"> · {{ p.author }}</template>
            </span>
            <span class="settings-spacer"></span>
            <span v-if="p.id === petActiveId" class="pet-badge">当前</span>
            <button v-else type="button" class="btn-secondary btn-tiny" @click="onPetSwitch(p.id)">切换</button>
            <button type="button" class="btn-secondary btn-tiny" @click="onPetRemove(p.id)">移除</button>
          </div>
        </div>

        <div class="settings-field">
          <div v-if="!petShowInstall">
            <button type="button" class="btn-secondary" @click="petShowInstall = true">＋ 安装新宠物</button>
          </div>
          <div v-else>
            <input
              id="petInstallInput"
              class="settings-input"
              v-model="petInstallInput"
              placeholder="粘贴画廊安装命令或宠物 slug"
              spellcheck="false"
              autocomplete="off"
              @keyup.enter="onPetInstall"
            >
            <div class="settings-row">
              <button type="button" class="btn-secondary" :disabled="petInstallBusy" @click="onPetInstall">
                {{ petInstallBusy ? '下载中…' : '安装' }}
              </button>
              <button type="button" class="btn-secondary" @click="petShowInstall = false">取消</button>
            </div>
          </div>
          <div class="settings-hint" v-if="petInstallStatus">{{ petInstallStatus }}</div>
          <div class="settings-hint">从宠物画廊（<code>codexpet.top</code> / <code>petdex.dev</code> 等）复制安装命令粘贴到上方，只下载素材、不执行脚本。</div>
        </div>

        <div class="settings-field">
          <div class="settings-row">
            <span class="settings-label-inline">大小</span>
            <button type="button" class="btn-secondary btn-tiny" @click="applyPetScale(petScale - PET_SCALE_STEP)">−</button>
            <button type="button" class="btn-secondary btn-tiny" @click="applyPetScale(100)">重置</button>
            <button type="button" class="btn-secondary btn-tiny" @click="applyPetScale(petScale + PET_SCALE_STEP)">＋</button>
            <span class="settings-label-inline">{{ petScale }}%</span>
          </div>
        </div>
      </div>

      <!-- 手机配对（LAN 模式） -->
      <div class="settings-section" data-section="lan-mode">
        <div class="settings-section-header">
          <span class="settings-section-title">手机配对（LAN 同步）</span>
          <label class="settings-toggle">
            <input type="checkbox" v-model="lanModeEnabled">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-field">
          <div class="settings-hint">开启后桌面服务会监听局域网，手机 App 可通过同一 Wi-Fi 同步项目状态。</div>
          <div class="settings-row">
            <button type="button" class="btn-secondary" @click="openQrCode">显示配对二维码</button>
          </div>
          <div class="settings-hint" style="color: rgba(211, 47, 47, 0.9);">⚠ 二维码包含明文 Token，请勿截图分享或让他人拍照。</div>
        </div>
      </div>

      <!-- Claude Code Hooks -->
      <div class="settings-section" data-section="hooks">
        <div class="settings-section-header">
          <span class="settings-section-title">Claude Code Hooks</span>
        </div>
        <div class="settings-field">
          <label class="settings-toggle-label">
            <input type="checkbox" v-model="hookEnabled.Notification">
            <span>Notification（Claude 需要输入时）</span>
          </label>
          <label class="settings-toggle-label">
            <input type="checkbox" v-model="hookEnabled.Stop">
            <span>Stop（响应结束）</span>
          </label>
          <label class="settings-toggle-label">
            <input type="checkbox" v-model="hookEnabled.PreToolUse">
            <span>PreToolUse（工具调用前）</span>
          </label>
        </div>
        <div class="settings-field">
          <label class="settings-label" for="hookSnippet">手动配置（粘贴到 ~/.claude/settings.json）</label>
          <textarea id="hookSnippet" class="settings-textarea" readonly :value="hookSnippet" rows="8"></textarea>
          <div class="settings-row">
            <button type="button" class="btn-secondary" @click="copySnippet">复制 JSON</button>
            <span v-if="copyStatus" class="settings-hint">{{ copyStatus }}</span>
          </div>
          <div class="settings-hint">勾选事件后片段实时更新；只含已勾选项。</div>
        </div>
        <div class="settings-field">
          <label class="settings-toggle-label">
            <input type="checkbox" :checked="hookAutoInstalled" disabled @change="onAutoInstallToggle">
            <span>自动写入 ~/.claude/settings.json（已禁用）</span>
          </label>
          <span class="settings-hint">请手动复制上方 JSON 粘贴到 ~/.claude/settings.json</span>
        </div>
      </div>
    </div>

    <div class="settings-footer">
      <button class="btn-cancel" @click="onCancel">取消</button>
      <button class="btn-save" :disabled="saving || !thresholdsValid" @click="onSave">{{ saving ? '保存中...' : '保存' }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import type { SettingsSavePayload, PetMeta } from './types/electron';
import { DEFAULT_USAGE_THRESHOLDS } from './types/messages';
import { parseInput, fetchPet } from './pet/pet-install';
import { applyTheme, useTheme } from '@/composables/useTheme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ChevronDown, Eye, EyeOff, X } from 'lucide-vue-next';

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

// ---- 外观主题 ----
// useTheme 负责启动时应用已保存主题 + 监听主进程 theme:changed 即时切换；
// 本地改 Select 时 themeMode 变化触发 watcher，立即预览效果。
const { mode: themeMode } = useTheme();

watch(themeMode, (value) => {
  applyTheme(value);
});

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

  themeMode.value = cfg.appearance?.theme ?? 'dark';

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
      appearance: { theme: themeMode.value },
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
  <div class="drag-region flex h-screen w-screen select-none flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
    <header class="flex shrink-0 items-center justify-between border-b border-border/70 px-4 py-3">
      <span class="text-sm font-semibold text-foreground">用量监控设置</span>
      <Button variant="ghost" size="icon" class="no-drag h-6 w-6" title="关闭" @click="onCancel">
        <X class="h-4 w-4" />
      </Button>
    </header>

    <div class="no-drag min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
      <!-- 外观 -->
      <section class="space-y-2">
        <h3 class="text-sm font-medium text-foreground">外观</h3>
        <div class="space-y-1">
          <span class="block text-xs text-muted-foreground">主题</span>
          <Select v-model="themeMode">
            <SelectTrigger class="no-drag h-8 w-full">
              <SelectValue placeholder="选择主题" />
              <ChevronDown class="h-4 w-4 opacity-50" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">跟随系统</SelectItem>
              <SelectItem value="light">浅色</SelectItem>
              <SelectItem value="dark">深色</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>
      <Separator />

      <!-- 全局代理 -->
      <section class="space-y-2">
        <h3 class="text-sm font-medium text-foreground">代理设置</h3>
        <div class="space-y-1">
          <label class="block text-xs text-muted-foreground" for="proxyUrl">代理地址</label>
          <Input
            id="proxyUrl"
            v-model="proxyUrl"
            :placeholder="hasProxy ? '留空保持原值' : '如 http://127.0.0.1:7890'"
            class="no-drag h-8 font-mono"
            autocomplete="off"
            spellcheck="false"
            @input="proxyUrlChanged = true"
          />
        </div>
      </section>
      <Separator />

      <!-- Kimi -->
      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-foreground">Kimi</h3>
          <Switch v-model="kimi.enabled" class="no-drag" />
        </div>
        <label class="no-drag flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" v-model="kimi.useProxy" class="h-3.5 w-3.5 accent-primary">
          <span>使用代理</span>
        </label>
        <div class="space-y-1">
          <label class="block text-xs text-muted-foreground" for="kimiToken">API Key</label>
          <div class="relative">
            <Input
              :type="kimi.showToken ? 'text' : 'password'"
              id="kimiToken"
              v-model="kimi.token"
              :placeholder="kimi.hasToken ? '留空保持原值' : '粘贴 Kimi 开放平台 API Key'"
              class="no-drag h-8 pr-9 font-mono"
              autocomplete="off"
              spellcheck="false"
              @input="kimi.tokenChanged = true"
            />
            <Button type="button" variant="ghost" size="icon" class="no-drag absolute right-0 top-0 h-8 w-8 text-muted-foreground" title="显示/隐藏" @click="kimi.showToken = !kimi.showToken">
              <EyeOff v-if="kimi.showToken" class="h-4 w-4" />
              <Eye v-else class="h-4 w-4" />
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">在开放平台（platform.kimi.com）创建 API Key，粘贴到上方，用于查询 Coding 套餐用量。</p>
        </div>
      </section>
      <Separator />

      <!-- MiniMax -->
      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-foreground">MiniMax</h3>
          <Switch v-model="minimax.enabled" class="no-drag" />
        </div>
        <label class="no-drag flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" v-model="minimax.useProxy" class="h-3.5 w-3.5 accent-primary">
          <span>使用代理</span>
        </label>
        <div class="space-y-1">
          <label class="block text-xs text-muted-foreground" for="minimaxToken">Bearer Token</label>
          <div class="relative">
            <Input
              :type="minimax.showToken ? 'text' : 'password'"
              id="minimaxToken"
              v-model="minimax.token"
              :placeholder="minimax.hasToken ? '留空保持原值' : '粘贴 Bearer Token'"
              class="no-drag h-8 pr-9 font-mono"
              autocomplete="off"
              spellcheck="false"
              @input="minimax.tokenChanged = true"
            />
            <Button type="button" variant="ghost" size="icon" class="no-drag absolute right-0 top-0 h-8 w-8 text-muted-foreground" title="显示/隐藏" @click="minimax.showToken = !minimax.showToken">
              <EyeOff v-if="minimax.showToken" class="h-4 w-4" />
              <Eye v-else class="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
      <Separator />

      <!-- Copilot -->
      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-foreground">Copilot</h3>
          <Switch v-model="copilot.enabled" class="no-drag" />
        </div>
        <label class="no-drag flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" v-model="copilot.useProxy" class="h-3.5 w-3.5 accent-primary">
          <span>使用代理</span>
        </label>
        <div class="space-y-1">
          <span class="block text-xs text-muted-foreground">GitHub 账号授权（推荐）</span>
          <div class="flex gap-2">
            <Button type="button" variant="secondary" size="sm" class="no-drag" :disabled="deviceFlowBusy" @click="startCopilotDeviceFlow">
              {{ deviceFlowBusy ? '等待授权中...' : (copilotOAuth ? '重新连接 GitHub' : '连接 GitHub') }}
            </Button>
            <Button type="button" variant="secondary" size="sm" class="no-drag" v-if="deviceFlowBusy" @click="cancelCopilotDeviceFlow">取消</Button>
          </div>
          <p v-if="deviceUserCode" class="text-base tracking-widest text-foreground">验证码：<strong>{{ deviceUserCode }}</strong></p>
          <p v-if="deviceStatus" class="text-xs text-muted-foreground">{{ deviceStatus }}</p>
          <p v-else-if="copilotOAuth" class="text-xs text-muted-foreground">已通过 GitHub OAuth 连接（保存后覆盖旧 Cookie）。</p>
        </div>
        <div class="space-y-1">
          <label class="block text-xs text-muted-foreground" for="copilotToken">Cookie（备选，优先使用上方授权）</label>
          <div class="relative">
            <Input
              :type="copilot.showToken ? 'text' : 'password'"
              id="copilotToken"
              v-model="copilot.token"
              :placeholder="copilot.hasToken ? '留空保持原值' : '粘贴整段浏览器 Cookie'"
              class="no-drag h-8 pr-9 font-mono"
              autocomplete="off"
              spellcheck="false"
              @input="copilot.tokenChanged = true"
            />
            <Button type="button" variant="ghost" size="icon" class="no-drag absolute right-0 top-0 h-8 w-8 text-muted-foreground" title="显示/隐藏" @click="copilot.showToken = !copilot.showToken">
              <EyeOff v-if="copilot.showToken" class="h-4 w-4" />
              <Eye v-else class="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
      <Separator />

      <!-- DeepSeek -->
      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-foreground">DeepSeek</h3>
          <Switch v-model="deepseek.enabled" class="no-drag" />
        </div>
        <label class="no-drag flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" v-model="deepseek.useProxy" class="h-3.5 w-3.5 accent-primary">
          <span>使用代理</span>
        </label>
        <div class="space-y-1">
          <label class="block text-xs text-muted-foreground" for="deepseekToken">API Key</label>
          <div class="relative">
            <Input
              :type="deepseek.showToken ? 'text' : 'password'"
              id="deepseekToken"
              v-model="deepseek.token"
              :placeholder="deepseek.hasToken ? '留空保持原值' : '粘贴 platform.deepseek.com 的 API Key'"
              class="no-drag h-8 pr-9 font-mono"
              autocomplete="off"
              spellcheck="false"
              @input="deepseek.tokenChanged = true"
            />
            <Button type="button" variant="ghost" size="icon" class="no-drag absolute right-0 top-0 h-8 w-8 text-muted-foreground" title="显示/隐藏" @click="deepseek.showToken = !deepseek.showToken">
              <EyeOff v-if="deepseek.showToken" class="h-4 w-4" />
              <Eye v-else class="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
      <Separator />

      <!-- Codex -->
      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-foreground">Codex</h3>
          <Switch v-model="codexEnabled" class="no-drag" />
        </div>
        <label class="no-drag flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" v-model="codexUseProxy" class="h-3.5 w-3.5 accent-primary">
          <span>使用代理</span>
        </label>
        <p v-if="codexAutoAvailable" class="text-xs text-muted-foreground">已检测到本机 Codex CLI 登录（~/.codex/auth.json），自动读取，无需配置。</p>
        <p v-else class="text-xs text-muted-foreground">未检测到本机 Codex CLI 登录。请先安装并登录 Codex CLI（~/.codex/auth.json）。</p>
      </section>
      <Separator />

      <!-- 火山引擎 Ark Coding Plan -->
      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-foreground">火山引擎 (Ark Coding Plan)</h3>
          <Switch v-model="volcengineEnabled" class="no-drag" />
        </div>
        <label class="no-drag flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" v-model="volcengineUseProxy" class="h-3.5 w-3.5 accent-primary">
          <span>使用代理</span>
        </label>
        <div class="space-y-1">
          <label class="block text-xs text-muted-foreground" for="volcengineAccessKey">Access Key ID</label>
          <div class="relative">
            <Input
              :type="volcengineShowAccessKey ? 'text' : 'password'"
              id="volcengineAccessKey"
              v-model="volcengineAccessKey"
              :placeholder="volcengineHasAccessKey ? '留空保持原值' : 'AKLT...'"
              class="no-drag h-8 pr-9 font-mono"
              autocomplete="off" spellcheck="false"
              @input="volcengineAccessKeyChanged = true"
            />
            <Button type="button" variant="ghost" size="icon" class="no-drag absolute right-0 top-0 h-8 w-8 text-muted-foreground" title="显示/隐藏" @click="volcengineShowAccessKey = !volcengineShowAccessKey">
              <EyeOff v-if="volcengineShowAccessKey" class="h-4 w-4" />
              <Eye v-else class="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div class="space-y-1">
          <label class="block text-xs text-muted-foreground" for="volcengineSecretKey">Secret Access Key</label>
          <div class="relative">
            <Input
              :type="volcengineShowSecretKey ? 'text' : 'password'"
              id="volcengineSecretKey"
              v-model="volcengineSecretKey"
              :placeholder="volcengineHasSecretKey ? '留空保持原值' : '粘贴 Secret Access Key'"
              class="no-drag h-8 pr-9 font-mono"
              autocomplete="off" spellcheck="false"
              @input="volcengineSecretKeyChanged = true"
            />
            <Button type="button" variant="ghost" size="icon" class="no-drag absolute right-0 top-0 h-8 w-8 text-muted-foreground" title="显示/隐藏" @click="volcengineShowSecretKey = !volcengineShowSecretKey">
              <EyeOff v-if="volcengineShowSecretKey" class="h-4 w-4" />
              <Eye v-else class="h-4 w-4" />
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">在 console.volcengine.com/iam/keymanage/ 创建访问密钥（区域 cn-beijing）。AK/SK 长期有效，无需再维护 Cookie。</p>
        </div>
      </section>
      <Separator />

      <!-- 小米 MiMo -->
      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-foreground">小米 MiMo</h3>
          <Switch v-model="mimo.enabled" class="no-drag" />
        </div>
        <label class="no-drag flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" v-model="mimo.useProxy" class="h-3.5 w-3.5 accent-primary">
          <span>使用代理</span>
        </label>
        <div class="space-y-1">
          <label class="block text-xs text-muted-foreground" for="mimoCookie">控制台 Cookie</label>
          <div class="relative">
            <Input
              :type="mimo.showToken ? 'text' : 'password'"
              id="mimoCookie"
              v-model="mimo.token"
              :placeholder="mimo.hasToken ? '留空保持原值' : '粘贴整段 Cookie'"
              class="no-drag h-8 pr-9 font-mono"
              autocomplete="off"
              spellcheck="false"
              @input="mimo.tokenChanged = true"
            />
            <Button type="button" variant="ghost" size="icon" class="no-drag absolute right-0 top-0 h-8 w-8 text-muted-foreground" title="显示/隐藏" @click="mimo.showToken = !mimo.showToken">
              <EyeOff v-if="mimo.showToken" class="h-4 w-4" />
              <Eye v-else class="h-4 w-4" />
            </Button>
          </div>
          <p class="text-xs leading-relaxed text-muted-foreground">
            MiMo 余额只由网页控制台接口暴露，调模型的 <code class="rounded bg-muted px-1 font-mono text-[11px]">sk-</code> API Key 查不到。
            打开 <code class="rounded bg-muted px-1 font-mono text-[11px]">platform.xiaomimimo.com/#/console/balance</code> → F12 → Network → 刷新 →
            找到 <code class="rounded bg-muted px-1 font-mono text-[11px]">api/v1/balance</code> 请求 → 复制整段 <code class="rounded bg-muted px-1 font-mono text-[11px]">Cookie</code> 请求头
            （需含 <code class="rounded bg-muted px-1 font-mono text-[11px]">api-platform_serviceToken</code> 与 <code class="rounded bg-muted px-1 font-mono text-[11px]">userId</code>）。会话过期后需重新粘贴。
          </p>
        </div>
      </section>
      <Separator />

      <!-- 刷新周期 -->
      <section class="space-y-2">
        <h3 class="text-sm font-medium text-foreground">刷新周期</h3>
        <Select v-model="intervalMinutes">
          <SelectTrigger class="no-drag h-8 w-full">
            <SelectValue placeholder="选择刷新周期" />
            <ChevronDown class="h-4 w-4 opacity-50" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="5">5 分钟</SelectItem>
            <SelectItem :value="10">10 分钟</SelectItem>
            <SelectItem :value="15">15 分钟</SelectItem>
            <SelectItem :value="30">30 分钟</SelectItem>
            <SelectItem :value="60">60 分钟</SelectItem>
          </SelectContent>
        </Select>
      </section>
      <Separator />

      <!-- 用量阈值 -->
      <section class="space-y-2">
        <h3 class="text-sm font-medium text-foreground">用量阈值</h3>
        <div class="space-y-1">
          <span class="block text-xs text-muted-foreground">进度条颜色切换点（已用 %）</span>
          <div class="flex items-center gap-2">
            <label class="text-xs text-muted-foreground" for="warnThreshold">warn</label>
            <Input
              id="warnThreshold"
              type="number"
              min="0" max="99" step="1"
              v-model.number="warnThreshold"
              class="no-drag h-8 w-16"
              @input="validateThresholds"
            />
            <label class="text-xs text-muted-foreground" for="dangerThreshold">danger</label>
            <Input
              id="dangerThreshold"
              type="number"
              min="1" max="100" step="1"
              v-model.number="dangerThreshold"
              class="no-drag h-8 w-16"
              @input="validateThresholds"
            />
          </div>
          <p v-if="thresholdError" class="text-xs text-[color:var(--danger)]">{{ thresholdError }}</p>
          <p v-else class="text-xs text-muted-foreground">已用 % 超过 danger 变红，超过 warn 变黄，否则绿。warn 必须小于 danger。</p>
        </div>
      </section>
      <Separator />

      <!-- 悬浮球 -->
      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-foreground">悬浮球</h3>
          <Switch v-model="floatingBallEnabled" class="no-drag" />
        </div>
        <p class="text-xs text-muted-foreground">桌面右下角常驻 80×80 状态指示器：中心 5h 剩余百分比、底部多模型 mini bar、有通知时顶部亮红点。单击切到主窗口，可拖动改位置。</p>
      </section>
      <Separator />

      <!-- 桌面宠物 -->
      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-foreground">桌面宠物</h3>
          <Switch v-model="petEnabled" class="no-drag" />
        </div>
        <p class="text-xs text-muted-foreground">养一只像素宠物，跟随 Kimi 工作状态变换动作。单击打开 Kimi Web，长按看用量，右键菜单，可拖动。</p>

        <div class="space-y-1">
          <span class="block text-xs text-muted-foreground">我的宠物</span>
          <p v-if="petLibrary.length === 0" class="text-xs text-muted-foreground">尚未安装宠物</p>
          <div v-for="p in petLibrary" :key="p.id" class="flex items-center gap-2">
            <span class="max-w-[150px] truncate text-xs text-muted-foreground" :title="p.author ? `${p.name} by ${p.author}` : p.name">
              {{ p.name }}<template v-if="p.author"> · {{ p.author }}</template>
            </span>
            <span class="flex-1"></span>
            <Badge v-if="p.id === petActiveId" variant="outline" class="no-drag border-[color:var(--fresh)] text-[color:var(--fresh)]">当前</Badge>
            <Button v-else type="button" variant="secondary" size="sm" class="no-drag h-7 px-2" @click="onPetSwitch(p.id)">切换</Button>
            <Button type="button" variant="secondary" size="sm" class="no-drag h-7 px-2" @click="onPetRemove(p.id)">移除</Button>
          </div>
        </div>

        <div class="space-y-1">
          <div v-if="!petShowInstall">
            <Button type="button" variant="secondary" size="sm" class="no-drag" @click="petShowInstall = true">＋ 安装新宠物</Button>
          </div>
          <div v-else class="space-y-2">
            <Input
              id="petInstallInput"
              v-model="petInstallInput"
              placeholder="粘贴画廊安装命令或宠物 slug"
              class="no-drag h-8"
              spellcheck="false"
              autocomplete="off"
              @keyup.enter="onPetInstall"
            />
            <div class="flex gap-2">
              <Button type="button" variant="secondary" size="sm" class="no-drag" :disabled="petInstallBusy" @click="onPetInstall">
                {{ petInstallBusy ? '下载中…' : '安装' }}
              </Button>
              <Button type="button" variant="secondary" size="sm" class="no-drag" @click="petShowInstall = false">取消</Button>
            </div>
          </div>
          <p v-if="petInstallStatus" class="text-xs text-muted-foreground">{{ petInstallStatus }}</p>
          <p class="text-xs text-muted-foreground">从宠物画廊（<code class="rounded bg-muted px-1 font-mono text-[11px]">codexpet.top</code> / <code class="rounded bg-muted px-1 font-mono text-[11px]">petdex.dev</code> 等）复制安装命令粘贴到上方，只下载素材、不执行脚本。</p>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-xs text-muted-foreground">大小</span>
          <Button type="button" variant="secondary" size="sm" class="no-drag h-7 px-2" @click="applyPetScale(petScale - PET_SCALE_STEP)">−</Button>
          <Button type="button" variant="secondary" size="sm" class="no-drag h-7 px-2" @click="applyPetScale(100)">重置</Button>
          <Button type="button" variant="secondary" size="sm" class="no-drag h-7 px-2" @click="applyPetScale(petScale + PET_SCALE_STEP)">＋</Button>
          <span class="text-xs text-muted-foreground">{{ petScale }}%</span>
        </div>
      </section>
      <Separator />

      <!-- 手机配对（LAN 模式） -->
      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-foreground">手机配对（LAN 同步）</h3>
          <Switch v-model="lanModeEnabled" class="no-drag" />
        </div>
        <p class="text-xs text-muted-foreground">开启后桌面服务会监听局域网，手机 App 可通过同一 Wi-Fi 同步项目状态。</p>
        <div class="flex">
          <Button type="button" variant="secondary" size="sm" class="no-drag" @click="openQrCode">显示配对二维码</Button>
        </div>
        <p class="text-xs font-medium text-[color:var(--danger)]">⚠ 二维码包含明文 Token，请勿截图分享或让他人拍照。</p>
      </section>
      <Separator />

      <!-- Claude Code Hooks -->
      <section class="space-y-2">
        <h3 class="text-sm font-medium text-foreground">Claude Code Hooks</h3>
        <div class="space-y-1">
          <label class="no-drag flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" v-model="hookEnabled.Notification" class="h-3.5 w-3.5 accent-primary">
            <span>Notification（Claude 需要输入时）</span>
          </label>
          <label class="no-drag flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" v-model="hookEnabled.Stop" class="h-3.5 w-3.5 accent-primary">
            <span>Stop（响应结束）</span>
          </label>
          <label class="no-drag flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" v-model="hookEnabled.PreToolUse" class="h-3.5 w-3.5 accent-primary">
            <span>PreToolUse（工具调用前）</span>
          </label>
        </div>
        <div class="space-y-1">
          <label class="block text-xs text-muted-foreground" for="hookSnippet">手动配置（粘贴到 ~/.claude/settings.json）</label>
          <Textarea id="hookSnippet" :model-value="hookSnippet" readonly rows="8" class="no-drag select-text font-mono text-xs" />
          <div class="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" class="no-drag" @click="copySnippet">复制 JSON</Button>
            <span v-if="copyStatus" class="text-xs text-muted-foreground">{{ copyStatus }}</span>
          </div>
          <p class="text-xs text-muted-foreground">勾选事件后片段实时更新；只含已勾选项。</p>
        </div>
        <div class="space-y-1">
          <label class="no-drag flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" :checked="hookAutoInstalled" disabled @change="onAutoInstallToggle" class="h-3.5 w-3.5 accent-primary">
            <span>自动写入 ~/.claude/settings.json（已禁用）</span>
          </label>
          <p class="text-xs text-muted-foreground">请手动复制上方 JSON 粘贴到 ~/.claude/settings.json</p>
        </div>
      </section>
    </div>

    <footer class="no-drag flex shrink-0 items-center justify-end gap-2 border-t border-border/70 px-4 py-3">
      <Button variant="secondary" class="no-drag" @click="onCancel">取消</Button>
      <Button class="no-drag" :disabled="saving || !thresholdsValid" @click="onSave">{{ saving ? '保存中...' : '保存' }}</Button>
    </footer>
  </div>
</template>

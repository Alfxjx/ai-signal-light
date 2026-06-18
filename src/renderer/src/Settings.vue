<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { SettingsSavePayload } from './types/electron';
import { DEFAULT_USAGE_THRESHOLDS } from './types/messages';

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
const proxyUrl = ref<string>('');
const proxyUrlChanged = ref<boolean>(false);
const hasProxy = ref<boolean>(false);
const intervalMinutes = ref<number>(10);
const saving = ref<boolean>(false);
const floatingBallEnabled = ref<boolean>(false);

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
  if (cfg.thresholds) {
    warnThreshold.value = cfg.thresholds.warn;
    dangerThreshold.value = cfg.thresholds.danger;
  }
  await refreshHelperPath();
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
      proxy: {
        url: proxyUrl.value.trim(),
        urlChanged: proxyUrlChanged.value,
      },
      intervalMinutes: intervalMinutes.value,
      hooks: { enabled: { ...hookEnabled } },
      floatingBall: { enabled: floatingBallEnabled.value },
      thresholds: {
        warn: warnThreshold.value,
        danger: dangerThreshold.value,
      },
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
          <label class="settings-label" for="kimiToken">Bearer Token</label>
          <div class="settings-input-wrap">
            <input
              :type="kimi.showToken ? 'text' : 'password'"
              id="kimiToken"
              class="settings-input"
              v-model="kimi.token"
              :placeholder="kimi.hasToken ? '留空保持原值' : '粘贴 Bearer Token'"
              autocomplete="off"
              spellcheck="false"
              @input="kimi.tokenChanged = true"
            >
            <button type="button" class="btn-toggle-visibility" title="显示/隐藏" @click="kimi.showToken = !kimi.showToken">
              {{ kimi.showToken ? '🔒' : '👁' }}
            </button>
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
          <label class="settings-label" for="copilotToken">Cookie</label>
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

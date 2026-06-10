<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { SettingsSavePayload } from './types/electron';

interface ProviderState {
  enabled: boolean;
  token: string;
  tokenChanged: boolean;
  hasToken: boolean;
  showToken: boolean;
}

function makeProvider(): ProviderState {
  return {
    enabled: false,
    token: '',
    tokenChanged: false,
    hasToken: false,
    showToken: false,
  };
}

const kimi = reactive<ProviderState>(makeProvider());
const minimax = reactive<ProviderState>(makeProvider());
const intervalMinutes = ref<number>(10);
const saving = ref<boolean>(false);

onMounted(async () => {
  if (!window.electronAPI) {
    console.error('electronAPI not available');
    return;
  }

  const cfg = await window.electronAPI.getSettings();
  if (!cfg) return;

  kimi.enabled = !!cfg.kimi.enabled;
  kimi.token = cfg.hasKimiToken ? (cfg.kimi.token || '') : '';
  kimi.hasToken = !!cfg.hasKimiToken;

  minimax.enabled = !!cfg.minimax.enabled;
  minimax.token = cfg.hasMiniMaxToken ? (cfg.minimax.token || '') : '';
  minimax.hasToken = !!cfg.hasMiniMaxToken;

  intervalMinutes.value = cfg.intervalMinutes || 10;
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
      },
      minimax: {
        token: minimax.token.trim(),
        tokenChanged: minimax.tokenChanged,
        enabled: minimax.enabled,
      },
      intervalMinutes: intervalMinutes.value,
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
    </div>

    <div class="settings-footer">
      <button class="btn-cancel" @click="onCancel">取消</button>
      <button class="btn-save" :disabled="saving" @click="onSave">{{ saving ? '保存中...' : '保存' }}</button>
    </div>
  </div>
</template>

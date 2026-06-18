<script setup lang="ts">
defineProps<{
  isPinned: boolean;
  isElectron: boolean;
}>();

const emit = defineEmits<{
  togglePin: [];
  minimize: [];
  openSettings: [];
  toggleFloatingBall: [];
}>();
</script>

<template>
  <div class="title-bar">
    <div class="title">USAiGE</div>
    <div class="window-controls">
      <button class="btn-ball" title="悬浮窗" @click="emit('toggleFloatingBall')">⬡</button>
      <button class="btn-pin" title="Pin" :style="{ opacity: isPinned ? '1' : '0.4' }" @click="emit('togglePin')">📌</button>
      <button class="btn-settings" title="Settings" @click="emit('openSettings')">⚙</button>
      <button class="btn-minimize" title="Minimize" @click="emit('minimize')">−</button>
    </div>
  </div>
</template>

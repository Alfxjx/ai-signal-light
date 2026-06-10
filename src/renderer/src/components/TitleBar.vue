<script setup lang="ts">
defineProps<{
  isPinned: boolean;
  isElectron: boolean;
}>();

const emit = defineEmits<{
  togglePin: [];
  minimize: [];
}>();
</script>

<template>
  <div class="title-bar">
    <div class="title">Coding Status</div>
    <div class="window-controls">
      <button class="btn-pin" title="Pin" :style="{ opacity: isPinned ? '1' : '0.4' }" @click="emit('togglePin')">📌</button>
      <button class="btn-minimize" title="Minimize" @click="emit('minimize')">−</button>
    </div>
  </div>
</template>

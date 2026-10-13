<script setup lang="ts">
import { Pin, PinOff, Settings, Minus, X, Activity, Sun, Moon } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';

defineProps<{
  isPinned: boolean;
  isElectron: boolean;
  isDark: boolean;
}>();

const emit = defineEmits<{
  togglePin: [];
  minimize: [];
  openSettings: [];
  toggleFloatingBall: [];
  toggleTheme: [];
  close: [];
}>();
</script>

<template>
  <!-- 标题栏本身是拖拽区（父容器 drag-region 已覆盖），按钮区标 no-drag -->
  <div class="flex items-center justify-between border-b px-4 py-3">
    <div class="text-sm font-semibold tracking-wide text-foreground/90">USAiGE</div>
    <div class="no-drag flex items-center gap-1.5">
      <Button variant="ghost" size="icon" class="h-6 w-6" :title="isDark ? '切换到浅色主题' : '切换到深色主题'"
        @click="emit('toggleTheme')">
        <Moon v-if="isDark" />
        <Sun v-else />
      </Button>
      <Button variant="ghost" size="icon" class="h-6 w-6" title="悬浮窗" @click="emit('toggleFloatingBall')">
        <Activity />
      </Button>
      <Button variant="ghost" size="icon" class="h-6 w-6" title="Pin"
        :style="{ opacity: isPinned ? '1' : '0.4' }" @click="emit('togglePin')">
        <Pin v-if="isPinned" />
        <PinOff v-else />
      </Button>
      <Button variant="ghost" size="icon" class="h-6 w-6" title="Settings" @click="emit('openSettings')">
        <Settings />
      </Button>
      <Button variant="ghost" size="icon" class="h-6 w-6" title="Minimize" @click="emit('minimize')">
        <Minus />
      </Button>
      <Button variant="ghost" size="icon" class="h-6 w-6" title="Close" @click="emit('close')">
        <X />
      </Button>
    </div>
  </div>
</template>

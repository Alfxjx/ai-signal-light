<script setup lang="ts">
import { ref } from 'vue';

const isOpen = ref(false);

const links = [
  { label: '功能', href: '#features' },
  { label: '使用', href: '#how-it-works' },
  { label: 'FAQ', href: '#faq' },
  { label: '下载', href: 'https://github.com/Alfxjx/ai-signal-light/releases' },
];

function close() {
  isOpen.value = false;
}
</script>

<template>
  <header class="fixed top-0 left-0 right-0 z-50">
    <div class="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <nav class="glass-panel flex items-center justify-between px-5 py-3">
        <a href="#hero" class="flex items-center gap-3">
          <img src="/src/assets/technical-support.png" alt="" class="h-8 w-8" />
          <span class="text-lg font-semibold tracking-tight">AI 状态随身看</span>
        </a>

        <!-- Desktop nav -->
        <div class="hidden items-center gap-6 md:flex">
          <a
            v-for="link in links"
            :key="link.href"
            :href="link.href"
            class="text-sm text-gray-300 transition-colors hover:text-white"
          >
            {{ link.label }}
          </a>
          <a
            href="https://github.com/Alfxjx/ai-signal-light"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/20"
          >
            GitHub
          </a>
        </div>

        <!-- Mobile hamburger -->
        <button
          class="flex h-10 w-10 flex-col items-center justify-center gap-1.5 md:hidden"
          aria-label="打开菜单"
          @click="isOpen = !isOpen"
        >
          <span
            class="block h-0.5 w-6 bg-white transition-transform"
            :class="{ 'translate-y-2 rotate-45': isOpen }"
          />
          <span
            class="block h-0.5 w-6 bg-white transition-opacity"
            :class="{ 'opacity-0': isOpen }"
          />
          <span
            class="block h-0.5 w-6 bg-white transition-transform"
            :class="{ '-translate-y-2 -rotate-45': isOpen }"
          />
        </button>
      </nav>
    </div>

    <!-- Mobile menu overlay -->
    <div
      v-if="isOpen"
      class="fixed inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-[#0a0a12]/95 backdrop-blur-xl md:hidden"
      @click.self="close"
    >
      <a
        v-for="link in links"
        :key="link.href"
        :href="link.href"
        class="text-2xl font-medium text-gray-200 transition-colors hover:text-white"
        @click="close"
      >
        {{ link.label }}
      </a>
      <a
        href="https://github.com/Alfxjx/ai-signal-light"
        target="_blank"
        rel="noopener noreferrer"
        class="rounded-lg bg-white/10 px-6 py-3 text-lg font-medium transition-colors hover:bg-white/20"
        @click="close"
      >
        GitHub
      </a>
    </div>
  </header>
</template>

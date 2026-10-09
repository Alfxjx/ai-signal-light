<script setup lang="ts">
import { ref } from 'vue';

const isOpen = ref(false);

const links = [
  { label: '功能', href: '#features' },
  { label: '上手', href: '#how-it-works' },
  { label: 'FAQ', href: '#faq' },
  { label: '下载', href: '#download' },
];

const REPO = 'https://github.com/Alfxjx/ai-signal-light';
const RELEASES = `${REPO}/releases`;

function close() {
  isOpen.value = false;
}
</script>

<template>
  <header class="fixed inset-x-0 top-0 z-50">
    <div class="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
      <nav class="panel flex items-center gap-4 px-4 py-2.5">
        <a href="#hero" class="flex items-center gap-2.5">
          <span class="led led-green led-dim" />
          <span class="text-[15px] font-semibold tracking-tight text-white">AI状态监控</span>
          <span class="label hidden sm:inline">local dashboard</span>
        </a>

        <!-- Desktop -->
        <div class="ml-auto hidden items-center gap-6 md:flex">
          <a
            v-for="link in links"
            :key="link.href"
            :href="link.href"
            class="text-[13px] text-gray-400 transition-colors hover:text-white"
          >
            {{ link.label }}
          </a>
          <a :href="REPO" target="_blank" rel="noopener noreferrer" class="btn btn-ghost !px-4 !py-2 !text-[13px]">
            GitHub
          </a>
          <a :href="RELEASES" target="_blank" rel="noopener noreferrer" class="btn btn-primary !px-4 !py-2 !text-[13px]">
            免费下载
          </a>
        </div>

        <!-- Mobile toggle -->
        <button
          class="ml-auto flex h-9 w-9 flex-col items-center justify-center gap-1.5 md:hidden"
          aria-label="打开菜单"
          :aria-expanded="isOpen"
          @click="isOpen = !isOpen"
        >
          <span
            class="block h-px w-5 bg-white transition-transform"
            :class="{ 'translate-y-[3.5px] rotate-45': isOpen }"
          />
          <span class="block h-px w-5 bg-white transition-opacity" :class="{ 'opacity-0': isOpen }" />
          <span
            class="block h-px w-5 bg-white transition-transform"
            :class="{ '-translate-y-[3.5px] -rotate-45': isOpen }"
          />
        </button>
      </nav>
    </div>

    <!-- Mobile menu -->
    <div
      v-if="isOpen"
      class="fixed inset-0 z-40 flex flex-col items-center justify-center gap-7 bg-ink-950/96 backdrop-blur-xl md:hidden"
      @click.self="close"
    >
      <a
        v-for="link in links"
        :key="link.href"
        :href="link.href"
        class="num text-2xl text-gray-200 transition-colors hover:text-led-green"
        @click="close"
      >
        {{ link.label }}
      </a>
      <a
        :href="REPO"
        target="_blank"
        rel="noopener noreferrer"
        class="btn btn-ghost"
        @click="close"
      >
        GitHub
      </a>
      <a
        :href="RELEASES"
        target="_blank"
        rel="noopener noreferrer"
        class="btn btn-primary"
        @click="close"
      >
        免费下载
      </a>
    </div>
  </header>
</template>

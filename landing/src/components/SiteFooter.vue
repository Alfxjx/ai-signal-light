<script setup lang="ts">
const REPO = 'https://github.com/Alfxjx/ai-signal-light';

const links = [
  { label: '仓库', href: REPO },
  { label: 'Releases', href: `${REPO}/releases` },
  { label: '问题反馈', href: `${REPO}/issues` },
  { label: 'Android 端', href: `${REPO}/tree/main/android-app` },
];

const year = new Date().getFullYear();
</script>

<template>
  <footer class="relative border-t border-white/[0.07] bg-ink-900/40">
    <div class="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div class="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div class="flex items-center gap-2.5">
          <span class="led led-green led-dim" />
          <span class="text-[15px] font-semibold text-white">AI状态监控</span>
          <span class="label hidden sm:inline">local ai dashboard</span>
        </div>

        <nav class="flex flex-wrap gap-x-6 gap-y-2">
          <a
            v-for="link in links"
            :key="link.href"
            :href="link.href"
            target="_blank"
            rel="noopener noreferrer"
            class="num text-[13px] text-ink-400 transition-colors hover:text-led-green"
          >
            {{ link.label }}
          </a>
        </nav>
      </div>

      <div class="mt-10 flex flex-col gap-2 border-t border-white/[0.06] pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-[12px] text-ink-500">© {{ year }} AI状态监控 · MIT License</p>
        <p class="text-[12px] text-ink-500">所有数据留在本机，不经过任何自建服务器。</p>
      </div>
    </div>
  </footer>
</template>

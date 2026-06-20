<script setup lang="ts">
const links = [
  { label: 'GitHub', href: 'https://github.com/Alfxjx/ai-signal-light' },
  { label: 'Releases', href: 'https://github.com/Alfxjx/ai-signal-light/releases' },
  { label: '问题反馈', href: 'https://github.com/Alfxjx/ai-signal-light/issues' },
];
</script>

<template>
  <footer class="border-t border-white/10 py-12">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="flex flex-col items-center justify-between gap-6 md:flex-row">
        <div class="flex items-center gap-3">
          <img src="/src/assets/technical-support.png" alt="" class="h-7 w-7" />
          <span class="font-medium">AI 状态随身看</span>
        </div>

        <div class="flex flex-wrap justify-center gap-6">
          <a
            v-for="link in links"
            :key="link.href"
            :href="link.href"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm text-gray-400 transition-colors hover:text-white"
          >
            {{ link.label }}
          </a>
        </div>
      </div>

      <p class="mt-8 text-center text-sm text-gray-500">
        © {{ new Date().getFullYear() }} AI状态监控. MIT License.
      </p>
    </div>
  </footer>
</template>

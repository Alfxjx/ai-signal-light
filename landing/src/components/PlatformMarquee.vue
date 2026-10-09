<script setup lang="ts">
import ScrollReveal from './ScrollReveal.vue';

const platforms = [
  { name: 'Claude Code', tone: 'green' },
  { name: 'Kimi Code (web)', tone: 'amber' },
  { name: 'Kimi', tone: 'green' },
  { name: 'MiniMax', tone: 'green' },
  { name: 'GitHub Copilot', tone: 'cyan' },
  { name: 'DeepSeek', tone: 'cyan' },
  { name: 'Codex', tone: 'green' },
  { name: '火山方舟 Ark', tone: 'amber' },
  { name: 'MiMo', tone: 'cyan' },
  { name: 'opencode 插件', tone: 'slate' },
];
</script>

<template>
  <section class="relative border-y border-white/[0.06] bg-ink-900/40 py-5">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <ScrollReveal>
        <p class="label mb-4 text-center">盯这些地方</p>
      </ScrollReveal>
    </div>

    <div
      class="relative flex overflow-hidden"
      style="mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); -webkit-mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)"
    >
      <div class="flex shrink-0 animate-marquee items-center gap-3 pr-3">
        <span
          v-for="(p, i) in [...platforms, ...platforms]"
          :key="`${p.name}-${i}`"
          class="panel flex shrink-0 items-center gap-2 px-3.5 py-2"
        >
          <span class="led" :class="`led-${p.tone}`" style="width: 6px; height: 6px" />
          <span class="num text-[12px] text-gray-300">{{ p.name }}</span>
        </span>
      </div>
    </div>
  </section>
</template>

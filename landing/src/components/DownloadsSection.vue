<script setup lang="ts">
import ScrollReveal from './ScrollReveal.vue';
import SectionHeading from './SectionHeading.vue';

const RELEASES = 'https://github.com/Alfxjx/ai-signal-light/releases';

const targets = [
  {
    os: 'Windows',
    format: 'portable · 单文件 exe',
    desc: '下载即用，不写注册表。想装到 PATH 的话手动挪一下位置就行。',
    led: 'led-cyan',
  },
  {
    os: 'macOS',
    format: 'dmg',
    desc: '拖进 Applications。首次打开若被拦，在系统设置里放行一次。',
    led: 'led-green',
  },
  {
    os: 'Linux',
    format: 'AppImage',
    desc: '给执行权限后直接运行；想集成托盘请配合桌面环境使用。',
    led: 'led-amber',
  },
];
</script>

<template>
  <section id="download" class="relative py-24">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <ScrollReveal>
        <SectionHeading
          align="center"
          eyebrow="下载"
          title="挑一个你平台的包"
          desc="三个平台都是同一个应用，MIT 协议免费。"
        />
      </ScrollReveal>

      <div class="mt-16 grid gap-4 md:grid-cols-3">
        <ScrollReveal v-for="t in targets" :key="t.os">
          <a
            :href="RELEASES"
            target="_blank"
            rel="noopener noreferrer"
            class="panel ticks group flex h-full flex-col p-6 transition-colors hover:border-led-green/40"
          >
            <div class="flex items-center gap-2">
              <span class="led" :class="t.led" />
              <span class="num text-[15px] font-semibold text-white">{{ t.os }}</span>
              <span class="label ml-auto">{{ t.format }}</span>
            </div>
            <p class="mt-4 flex-1 text-[13px] leading-relaxed text-gray-400">{{ t.desc }}</p>
            <span class="mt-6 inline-flex items-center gap-1.5 text-[13px] text-led-green">
              去 Releases 下载
              <span class="transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
            </span>
          </a>
        </ScrollReveal>
      </div>

      <p class="mt-8 text-center text-[12px] text-ink-500">
        移动端扫描桌面端二维码即可，无需单独下载。
      </p>
    </div>
  </section>
</template>

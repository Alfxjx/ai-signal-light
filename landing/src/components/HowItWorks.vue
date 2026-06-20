<script setup lang="ts">
import ScrollReveal from './ScrollReveal.vue';

const steps = [
  {
    number: '01',
    title: '下载安装桌面端',
    description: '支持 Windows / macOS / Linux，一键安装后即可启动悬浮面板。',
  },
  {
    number: '02',
    title: '配置监控源',
    description: '填入 Kimi、MiniMax、Copilot Token，选择需要监控的 AI 助手。',
  },
  {
    number: '03',
    title: '随时掌控状态',
    description: '桌面悬浮窗实时刷新，手机扫码配对，外出也能查看项目与用量。',
  },
];
</script>

<template>
  <section id="how-it-works" class="py-24">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <ScrollReveal>
        <div class="text-center">
          <h2 class="text-3xl font-bold sm:text-4xl">三步上手</h2>
          <p class="mx-auto mt-4 max-w-2xl text-gray-400">
            无需复杂设置，配置一次即可持续监控。
          </p>
        </div>
      </ScrollReveal>

      <div class="relative mt-16">
        <!-- connecting line for desktop -->
        <div class="absolute top-12 left-0 hidden h-0.5 w-full bg-white/10 lg:block"></div>

        <div class="grid gap-8 lg:grid-cols-3">
          <ScrollReveal v-for="step in steps" :key="step.number">
            <div class="relative flex flex-col items-center text-center">
              <div class="relative z-10 flex h-24 w-24 items-center justify-center rounded-full glass-panel">
                <span class="text-2xl font-bold text-accent-green">{{ step.number }}</span>
              </div>
              <h3 class="mt-6 text-xl font-semibold">{{ step.title }}</h3>
              <p class="mt-3 max-w-xs text-gray-400">{{ step.description }}</p>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import ScrollReveal from './ScrollReveal.vue';

const features = [
  {
    icon: '/src/assets/technical-support.png',
    title: 'Claude Code 项目监控',
    description: '自动扫描 ~/.claude/projects/ 对话记录，按距上次响应时间着色：绿色新鲜、黄色提醒、灰色离线。',
    accent: 'accent-green',
  },
  {
    icon: '/src/assets/graph.png',
    title: '多平台用量监控',
    description: '同时追踪 Kimi、MiniMax、GitHub Copilot 配额，超过 warn/danger 阈值自动标红预警。',
    accent: 'accent-yellow',
  },
  {
    icon: '/src/assets/technical-support.png',
    title: '局域网同步 + 手机配对',
    description: '桌面端生成二维码，手机扫码即可通过 LAN 实时同步 Claude 项目状态与待处理通知。',
    accent: 'accent-red',
  },
];

const accentClasses: Record<string, string> = {
  'accent-green': 'text-accent-green',
  'accent-yellow': 'text-accent-yellow',
  'accent-red': 'text-accent-red',
};
</script>

<template>
  <section id="features" class="py-24">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <ScrollReveal>
        <div class="text-center">
          <h2 class="text-3xl font-bold sm:text-4xl">核心功能</h2>
          <p class="mx-auto mt-4 max-w-2xl text-gray-400">
            从 Claude Code 项目状态到多模型用量，一站式掌握 AI 助手运行情况。
          </p>
        </div>
      </ScrollReveal>

      <div class="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <ScrollReveal v-for="feature in features" :key="feature.title">
          <div class="glass-card p-6 sm:p-8">
            <div class="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-white/5">
              <img :src="feature.icon" alt="" class="h-7 w-7" :class="accentClasses[feature.accent]" />
            </div>
            <h3 class="text-xl font-semibold">{{ feature.title }}</h3>
            <p class="mt-3 leading-relaxed text-gray-400">{{ feature.description }}</p>
          </div>
        </ScrollReveal>
      </div>
    </div>
  </section>
</template>

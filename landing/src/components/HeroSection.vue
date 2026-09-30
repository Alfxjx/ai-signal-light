<script setup lang="ts">
import ScrollReveal from './ScrollReveal.vue';
import PanelMock from '../mocks/PanelMock.vue';
import PhoneMock from '../mocks/PhoneMock.vue';

const REPO = 'https://github.com/Alfxjx/ai-signal-light';
const RELEASES = `${REPO}/releases`;

const stats = [
  { value: '7', unit: '家', label: 'AI 平台配额' },
  { value: '4', unit: '态', label: '悬浮球 LED' },
  { value: '0', unit: '上传', label: '数据不出本机' },
];
</script>

<template>
  <section id="hero" class="relative flex items-center pb-24 pt-32 sm:pt-36">
    <div class="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <ScrollReveal>
        <div class="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <!-- 左：文案 -->
          <div class="relative z-10">
            <p class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
              <span class="led led-green led-dim" />
              <span class="label">local-first · 跨平台 · 手机随身看</span>
            </p>

            <h1 class="mt-6 text-[34px] font-semibold leading-[1.15] tracking-tight sm:text-5xl lg:text-[56px]">
              AI 干活到哪一步<br />
              <span class="text-led-green">配额</span>还剩多少，抬眼就知道
            </h1>

            <p class="mt-6 max-w-xl text-[15px] leading-relaxed text-gray-400 sm:text-base">
              一个小小的常驻面板，盯住 Claude Code 与 Kimi Code (web) 的每个项目，
              再把 Kimi / MiniMax / Copilot / DeepSeek / Codex / 火山方舟 / MiMo
              七家配额排成一条 LED。不打断你，只是随时可看。
            </p>

            <p class="mt-3 max-w-xl text-[13px] leading-relaxed text-ink-400">
              不想开面板也行：给 opencode 装个用量侧边栏插件，或者只留一颗悬浮球 / 一只桌面宠物在桌面角落。
            </p>

            <div class="mt-9 flex flex-wrap items-center gap-3">
              <a :href="RELEASES" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
                免费下载
                <span aria-hidden="true">→</span>
              </a>
              <a href="#features" class="btn btn-ghost">看看它能盯什么</a>
            </div>

            <dl class="mt-10 flex flex-wrap gap-x-10 gap-y-5">
              <div v-for="s in stats" :key="s.label">
                <dt class="num text-2xl text-white">
                  {{ s.value }}<span class="ml-0.5 text-sm text-ink-400">{{ s.unit }}</span>
                </dt>
                <dd class="label mt-1">{{ s.label }}</dd>
              </div>
            </dl>
          </div>

          <!-- 右：主面板 mock + 手机小屏 -->
          <div class="relative">
            <div
              class="pointer-events-none absolute -inset-10 -z-10"
              style="background: radial-gradient(ellipse at 60% 40%, rgba(94, 240, 138, 0.12), transparent 62%)"
            />
            <div class="relative mx-auto w-full max-w-[420px] animate-floaty">
              <PanelMock />
            </div>

            <div class="absolute -bottom-16 -left-6 hidden animate-floaty lg:block" style="animation-delay: -2.4s">
              <PhoneMock />
            </div>

            <!-- 角标：本地端口 -->
            <div class="panel ticks absolute -right-3 -top-6 hidden items-center gap-2 px-3 py-2 sm:flex">
              <span class="led led-cyan" />
              <span class="num text-[10px] text-gray-300">ws://127.0.0.1:3456</span>
            </div>
          </div>
        </div>
      </ScrollReveal>
    </div>
  </section>
</template>

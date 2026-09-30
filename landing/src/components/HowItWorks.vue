<script setup lang="ts">
import ScrollReveal from './ScrollReveal.vue';
import SectionHeading from './SectionHeading.vue';

const steps = [
  {
    number: '01',
    title: '下载装上',
    desc: 'Windows 拿 portable 单文件，macOS 拿 dmg，Linux 拿 AppImage。解包即用，不装服务、不写注册表。',
    led: 'led-green',
  },
  {
    number: '02',
    title: '接上监控源',
    desc: 'Claude Code 装一下 Hooks（红点提醒就有了）；Kimi 用开放平台 API Key，Copilot 走一次设备码登录，Codex 自动读取，DeepSeek / MiMo / 火山方舟填自己的 key 或 cookie。',
    led: 'led-amber',
  },
  {
    number: '03',
    title: '扫码随身看',
    desc: '设置里打开二维码窗口，手机扫一下就连上局域网。桌面上的面板照旧，手机上多一个随身看板。',
    led: 'led-cyan',
  },
];
</script>

<template>
  <section id="how-it-works" class="relative py-24">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <ScrollReveal>
        <SectionHeading
          align="center"
          eyebrow="上手"
          title="三步就能用起来"
          desc="全程本地，配置一次之后它就自己待着。"
        />
      </ScrollReveal>

      <div class="relative mt-16">
        <!-- 桌面端连接线 -->
        <div
          class="absolute left-[16%] right-[16%] top-[38px] hidden h-px lg:block"
          style="background: linear-gradient(90deg, transparent, rgba(94, 240, 138, 0.35), transparent)"
        />

        <div class="grid gap-8 lg:grid-cols-3">
          <ScrollReveal v-for="step in steps" :key="step.number">
            <div class="panel ticks h-full p-6">
              <div class="flex items-center gap-3">
                <span class="num text-[13px] text-ink-500">{{ step.number }}</span>
                <span class="h-px flex-1 bg-white/10" />
                <span class="led" :class="step.led" />
              </div>
              <h3 class="mt-5 text-[17px] font-semibold text-white">{{ step.title }}</h3>
              <p class="mt-2.5 text-[13px] leading-relaxed text-gray-400">{{ step.desc }}</p>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </div>
  </section>
</template>

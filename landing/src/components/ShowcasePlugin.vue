<script setup lang="ts">
import ScrollReveal from './ScrollReveal.vue';
import SectionHeading from './SectionHeading.vue';
import TerminalMock from '../mocks/TerminalMock.vue';

const points = [
  { k: '零侵入', v: '独立 npm 包，只读桌面端 config.json，不改 opencode 自身配置' },
  { k: '可折叠', v: '顶栏一键收起，把整列还给终端' },
  { k: '双刷新', v: '表头刷全部，行尾刷单家；拉取中置灰' },
  { k: '配好了', v: 'helper CLI：init / set / doctor / install，自助改配置与装插件' },
];
</script>

<template>
  <section class="relative py-24">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="grid gap-14 lg:grid-cols-2 lg:items-center">
        <ScrollReveal>
          <div class="relative flex justify-center">
            <div
              class="pointer-events-none absolute -inset-8 -z-10"
              style="background: radial-gradient(ellipse at 50% 50%, rgba(87, 199, 255, 0.10), transparent 65%)"
            />
            <div class="animate-floaty">
              <TerminalMock />
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal>
          <SectionHeading
            eyebrow="opencode 插件"
            title="在终端侧边栏里看配额"
            desc="已经在用 opencode 的话，装一个 TUI 插件就够了：右侧固定一列用量，Kimi / MiniMax / 火山方舟 / DeepSeek / MiMo 的额度和余额直接排在会话旁边，5 分钟轮询一次，失败自动退避。"
          />

          <dl class="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-panel border border-white/[0.07] bg-white/[0.05] sm:grid-cols-2">
            <div v-for="p in points" :key="p.k" class="bg-ink-900 p-4">
              <dt class="label">{{ p.k }}</dt>
              <dd class="mt-2 text-[13px] leading-relaxed text-gray-300">{{ p.v }}</dd>
            </div>
          </dl>

          <p class="mt-6 text-[13px] leading-relaxed text-ink-400">
            凭据仍然只存在桌面端的
            <span class="num text-gray-300">%APPDATA%\AI状态监控\config.json</span>，
            插件是只读消费方 —— 桌面端照常轮询，插件照常显示，两边不互相依赖。
          </p>
        </ScrollReveal>
      </div>
    </div>
  </section>
</template>

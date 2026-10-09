<script setup lang="ts">
import ScrollReveal from './ScrollReveal.vue';
import SectionHeading from './SectionHeading.vue';
import PhoneMock from '../mocks/PhoneMock.vue';

/** 二维码占位图案（纯 CSS 网格，非真实编码内容） */
const qrSize = 11;
const qr = Array.from({ length: qrSize * qrSize }, (_, i) => {
  const x = i % qrSize;
  const y = Math.floor(i / qrSize);
  const inFinder =
    (x < 3 && y < 3) || (x > qrSize - 4 && y < 3) || (x < 3 && y > qrSize - 4);
  if (inFinder) {
    const ox = x < 3 ? 0 : qrSize - 3;
    const oy = y < 3 ? 0 : qrSize - 3;
    const dx = x - ox;
    const dy = y - oy;
    if (dx === 1 && dy === 1) return true;
    return dx === 0 || dx === 2 || dy === 0 || dy === 2;
  }
  return (x * 3 + y * 5 + ((x * y) % 4)) % 3 !== 0;
});

const points = [
  { k: '扫码即连', v: '二维码只带 host / port / apiKey，配置走 WS 反向拉取，不塞进码里' },
  { k: '局域网同步', v: '项目状态、待办红点、七家配额实时跟着桌面端' },
  { k: '阈值通知', v: '用量越过 warn / danger 阈值推系统通知' },
  { k: '主题切换', v: '浅色 / 深色 / 跟随系统' },
];
</script>

<template>
  <section class="relative py-24">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="grid gap-14 lg:grid-cols-2 lg:items-center">
        <ScrollReveal>
          <SectionHeading
            eyebrow="Android 伴侣"
            title="离开电脑，也能一眼看到"
            desc="原生 Kotlin + Compose 应用。桌面端生成二维码，手机扫一下就连上局域网内嵌的 WebSocket 服务，用量页和 Claude 项目页跟桌面端同一份数据源。"
          />

          <dl class="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-panel border border-white/[0.07] bg-white/[0.05] sm:grid-cols-2">
            <div v-for="p in points" :key="p.k" class="bg-ink-900 p-4">
              <dt class="label">{{ p.k }}</dt>
              <dd class="mt-2 text-[13px] leading-relaxed text-gray-300">{{ p.v }}</dd>
            </div>
          </dl>

          <p class="mt-6 text-[13px] leading-relaxed text-ink-400">
            火山方舟在手机端也能走 AK/SK 官方签名通道，密钥只填在手机本地，不随同步下发。
          </p>
        </ScrollReveal>

        <ScrollReveal>
          <div class="relative flex flex-wrap items-end justify-center gap-6">
            <!-- 扫码卡片 -->
            <div class="panel ticks hidden w-[188px] shrink-0 pb-4 sm:block">
              <p class="label border-b border-white/[0.07] px-3 py-2">scan to pair</p>
              <div class="mx-auto mt-4 w-fit rounded-sm bg-white p-2.5">
                <div
                  class="grid gap-px"
                  :style="{ gridTemplateColumns: `repeat(${qrSize}, 1fr)`, width: '112px', height: '112px' }"
                >
                  <span
                    v-for="(cell, i) in qr"
                    :key="i"
                    class="bg-ink-950"
                    :style="cell ? { background: '#0b0f14' } : { background: '#ffffff' }"
                  />
                </div>
              </div>
              <p class="num mt-3 text-center text-[10px] text-ink-400">192.168.x.x · 3456</p>
            </div>

            <!-- 手机 -->
            <div class="relative animate-floaty">
              <PhoneMock />
            </div>
          </div>
        </ScrollReveal>
      </div>
    </div>
  </section>
</template>

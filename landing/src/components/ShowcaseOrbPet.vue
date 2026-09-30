<script setup lang="ts">
import ScrollReveal from './ScrollReveal.vue';
import SectionHeading from './SectionHeading.vue';
import LedOrb from '../mocks/LedOrb.vue';
import DropdownMock from '../mocks/DropdownMock.vue';
import PetPixel from '../mocks/PetPixel.vue';

const states = [
  { key: 'approval', label: '待审核', hint: '红闪' },
  { key: 'editing', label: '编辑中', hint: '黄常亮' },
  { key: 'thinking', label: '思考中', hint: '黄呼吸' },
  { key: 'idle', label: '空闲', hint: '绿微光' },
  { key: 'offline', label: '离线', hint: '灰灭' },
] as const;

const bullets = [
  '短按弹下拉：最近活跃项目 + Kimi 5h 用量条，失焦 / Esc 自动收起',
  'Kimi 发来通知时，LED 右侧冒气泡，15 秒自动隐藏',
  '窗口 focusable: false —— 点它不抢 IDE 焦点',
];
</script>

<template>
  <section id="features" class="relative py-24">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <ScrollReveal>
        <SectionHeading
          eyebrow="悬浮球 · 桌面宠物"
          title="把状态缩到桌面角落，一个像素灯就够"
          desc="主面板之外还有两个独立开关：悬浮球是一颗拟物 LED，把 Kimi Code 的会话聚合成四态；桌面宠物用官方像素图集跟着同一状态跑动。两者互不干扰，也能同时开。"
        />
      </ScrollReveal>

      <div class="mt-16 grid gap-10 lg:grid-cols-2 lg:items-start">
        <!-- 悬浮球 -->
        <ScrollReveal>
          <div class="panel ticks sweep overflow-hidden p-6 sm:p-8">
            <div class="flex items-start gap-6">
              <div class="flex shrink-0 flex-col items-center gap-3">
                <LedOrb state="approval" size="lg" />
                <span class="label">approval</span>
              </div>
              <ul class="flex-1 space-y-2 pt-1">
                <li
                  v-for="s in states"
                  :key="s.key"
                  class="flex items-center gap-2.5 rounded-sm bg-white/[0.02] px-2.5 py-1.5"
                >
                  <LedOrb :state="s.key" size="sm" />
                  <span class="num text-[12px] text-gray-200">{{ s.label }}</span>
                  <span class="num ml-auto text-[11px] text-ink-500">{{ s.hint }}</span>
                </li>
              </ul>
            </div>

            <div class="mt-8 flex flex-col items-center gap-2 sm:flex-row sm:items-end sm:justify-center">
              <LedOrb state="idle" />
              <DropdownMock class="sm:ml-4" />
            </div>

            <ul class="mt-8 space-y-2.5 border-t border-white/[0.07] pt-6">
              <li v-for="b in bullets" :key="b" class="flex gap-2.5 text-[13px] leading-relaxed text-gray-400">
                <span class="led led-green led-dim mt-1.5" style="width: 6px; height: 6px" />
                {{ b }}
              </li>
            </ul>
          </div>
        </ScrollReveal>

        <!-- 桌面宠物 -->
        <ScrollReveal>
          <div class="panel ticks overflow-hidden p-6 sm:p-8">
            <div class="flex flex-col items-center gap-6 py-2">
              <PetPixel />
            </div>

            <dl class="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-white/[0.07] bg-white/[0.05]">
              <div v-for="item in [
                  { k: '单击', v: '打开本机 Kimi Web' },
                  { k: '长按 600ms', v: '弹出同一个下拉' },
                  { k: '右键', v: '原生菜单 / 打开设置' },
                  { k: '拖拽', v: '位置跨重启记住' },
                ]" :key="item.k" class="bg-ink-900 px-3.5 py-3">
                <dt class="label">{{ item.k }}</dt>
                <dd class="mt-1.5 text-[13px] text-gray-200">{{ item.v }}</dd>
              </div>
            </dl>

            <p class="mt-6 text-[13px] leading-relaxed text-gray-400">
              素材从画廊粘贴命令导入：<span class="num text-gray-300">awesome-codex-pet</span> /
              <span class="num text-gray-300">codex-pets.net</span> /
              <span class="num text-gray-300">petdex.dev</span>。只下载图集与清单，
              落地在 <span class="num text-gray-300">userData/pets/</span>，按 9 行动作表逐帧播放。
            </p>
          </div>
        </ScrollReveal>
      </div>
    </div>
  </section>
</template>

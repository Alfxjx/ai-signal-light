<script setup lang="ts">
/** 手机端 mock：用量 tab（双列 provider 卡 + 余额条） */
const cards = [
  { name: 'Kimi', percent: 63, pace: '偏快', tone: 'warn' },
  { name: 'MiniMax', percent: 41, pace: '正常', tone: 'ok' },
  { name: 'Copilot', percent: 12, pace: '偏慢', tone: 'ok' },
  { name: 'Codex', percent: 77, pace: '偏快', tone: 'warn' },
  { name: '火山方舟', percent: 88, pace: '偏快', tone: 'danger' },
  { name: 'MiMo', percent: 0, pace: '余额', tone: 'ok' },
]
</script>

<template>
  <div
    class="relative w-[248px] shrink-0 rounded-[26px] border border-white/12 bg-ink-900 p-2"
    style="box-shadow: 0 30px 70px -30px rgba(0, 0, 0, 0.95), inset 0 1px 0 rgba(255, 255, 255, 0.06)"
  >
    <div class="relative overflow-hidden rounded-[20px] bg-ink-950/90">
      <!-- 状态栏 -->
      <div class="flex items-center justify-between px-4 pb-1 pt-2.5">
        <span class="num text-[9px] text-ink-400">21:04</span>
        <span class="h-1 w-8 rounded-full bg-white/15" />
        <span class="num text-[9px] text-led-green">LAN</span>
      </div>

      <!-- 顶部：已连接 -->
      <div class="mx-3 mt-1 flex items-center gap-2 rounded-md border border-white/8 bg-white/[0.03] px-2.5 py-1.5">
        <span class="led led-green led-dim" style="width: 6px; height: 6px" />
        <span class="num text-[10px] text-gray-300">已连接 ai-signal-light</span>
        <span class="label ml-auto" style="font-size: 9px">2m</span>
      </div>

      <!-- Tab -->
      <div class="mx-3 mt-2.5 flex gap-1 rounded-md border border-white/8 bg-white/[0.02] p-0.5">
        <span class="flex-1 rounded-sm bg-white/[0.08] py-1 text-center text-[10px] text-white">用量</span>
        <span class="flex-1 rounded-sm py-1 text-center text-[10px] text-ink-400">Claude</span>
      </div>

      <!-- 余额条（DeepSeek / MiMo 共用样式） -->
      <div class="mx-3 mt-2.5 rounded-md border border-white/8 bg-gradient-to-r from-led-cyan/12 to-transparent px-2.5 py-2">
        <div class="flex items-baseline justify-between">
          <span class="label" style="font-size: 9px">deepseek balance</span>
          <span class="num text-[11px] text-led-cyan">¥ 62.40</span>
        </div>
        <div class="bar mt-1.5">
          <span class="bar-fill" style="width: 38%; background-image: linear-gradient(90deg, #2f9fd8, #57c7ff)" />
        </div>
      </div>

      <!-- provider 网格 -->
      <div class="grid grid-cols-2 gap-1.5 p-3">
        <div
          v-for="card in cards"
          :key="card.name"
          class="rounded-md border border-white/8 bg-white/[0.03] px-2 py-1.5"
        >
          <div class="flex items-center justify-between">
            <span class="num text-[10px] text-gray-200">{{ card.name }}</span>
            <span
              class="rounded-sm px-1 py-px text-[8px]"
              :class="card.tone === 'danger' ? 'bg-led-red/15 text-led-red' : 'bg-led-green/12 text-led-green'"
            >
              {{ card.pace }}
            </span>
          </div>
          <div class="mt-1.5 flex items-baseline gap-1">
            <span class="num text-[12px] text-white">{{ card.percent }}%</span>
            <span class="label" style="font-size: 8px">used</span>
          </div>
          <div class="bar mt-1">
            <span
              class="bar-fill"
              :class="card.tone === 'danger' ? 'is-danger' : card.tone === 'warn' ? 'is-warn' : ''"
              :style="{ width: `${card.percent}%` }"
            />
          </div>
        </div>
      </div>

      <!-- 底部导航 -->
      <div class="flex items-center justify-around border-t border-white/8 px-3 py-2">
        <span class="flex flex-col items-center gap-1">
          <span class="h-2 w-2 rounded-sm bg-led-green" />
          <span class="label" style="font-size: 8px">用量</span>
        </span>
        <span class="flex flex-col items-center gap-1">
          <span class="h-2 w-2 rounded-sm bg-white/15" />
          <span class="label" style="font-size: 8px">Claude</span>
        </span>
        <span class="flex flex-col items-center gap-1">
          <span class="h-2 w-2 rounded-sm bg-white/15" />
          <span class="label" style="font-size: 8px">扫码</span>
        </span>
        <span class="flex flex-col items-center gap-1">
          <span class="h-2 w-2 rounded-sm bg-white/15" />
          <span class="label" style="font-size: 8px">设置</span>
        </span>
      </div>
    </div>
  </div>
</template>

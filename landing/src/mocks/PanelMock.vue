<script setup lang="ts">
/** 主面板 mock：Claude Code 项目行 + Kimi Code (web) 状态 + 用量条，全部 CSS 还原 */
const claudeRows = [
  { name: 'ai-signal-light', ago: '2m', tone: 'green' },
  { name: 'landing', ago: '18m', tone: 'amber', pending: true },
  { name: 'android-app', ago: '3h', tone: 'slate' },
]

const kimiRows = [
  { name: 'ai-signal-light', phase: '编辑中', tone: 'amber' },
  { name: 'opencode-plugin', phase: '思考中', tone: 'amber' },
]

const usageRows = [
  { name: 'Kimi 5h', percent: 63, tone: 'ok' },
  { name: 'Kimi 周', percent: 28, tone: 'ok' },
  { name: 'MiniMax 5h', percent: 41, tone: 'ok' },
  { name: '火山方舟 周', percent: 88, tone: 'danger' },
]
</script>

<template>
  <div class="panel ticks sweep w-full overflow-hidden">
    <!-- 标题栏 -->
    <div class="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
      <span class="led led-red" style="width: 7px; height: 7px" />
      <span class="led led-amber" style="width: 7px; height: 7px" />
      <span class="led led-green" style="width: 7px; height: 7px" />
      <span class="label ml-1.5">ai-status-monitor</span>
      <span class="label ml-auto">3456</span>
    </div>

    <!-- Claude Code -->
    <div class="px-4 py-3">
      <div class="flex items-center justify-between">
        <span class="label">claude code</span>
        <span class="num text-[10px] text-ink-500">3 projects</span>
      </div>
      <ul class="mt-2 space-y-1.5">
        <li
          v-for="row in claudeRows"
          :key="row.name"
          class="flex items-center gap-2 rounded-sm bg-white/[0.025] px-2 py-1.5"
        >
          <span class="led" :class="`led-${row.tone}`" />
          <span class="num truncate text-[12px] text-gray-200">{{ row.name }}</span>
          <span
            v-if="row.pending"
            class="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-led-red led-blink"
            title="待处理通知"
          />
          <span class="num ml-auto shrink-0 text-[11px] text-ink-400">{{ row.ago }}</span>
        </li>
      </ul>
    </div>

    <!-- Kimi Code (web) -->
    <div class="border-t border-white/[0.07] px-4 py-3">
      <div class="flex items-center justify-between">
        <span class="label">kimi code (web)</span>
        <span class="flex items-center gap-1.5">
          <span class="led led-amber led-breathe" />
          <span class="num text-[10px] text-ink-400">编辑中</span>
        </span>
      </div>
      <ul class="mt-2 space-y-1.5">
        <li
          v-for="row in kimiRows"
          :key="row.name"
          class="flex items-center gap-2 rounded-sm bg-white/[0.025] px-2 py-1.5"
        >
          <span class="num truncate text-[12px] text-gray-200">{{ row.name }}</span>
          <span class="num ml-auto shrink-0 text-[11px]" :class="`text-led-${row.tone}`">
            {{ row.phase }}
          </span>
        </li>
      </ul>
    </div>

    <!-- 用量 -->
    <div class="border-t border-white/[0.07] px-4 py-3">
      <div class="flex items-center justify-between">
        <span class="label">usage · 7 providers</span>
        <span class="num text-[10px] text-ink-500">2m ago</span>
      </div>
      <ul class="mt-2.5 space-y-2.5">
        <li v-for="row in usageRows" :key="row.name">
          <div class="flex items-baseline justify-between">
            <span class="num text-[11px] text-gray-300">{{ row.name }}</span>
            <span
              class="num text-[11px]"
              :class="row.tone === 'danger' ? 'text-led-red' : 'text-gray-400'"
            >
              {{ row.percent }}%
            </span>
          </div>
          <div class="bar mt-1">
            <span
              class="bar-fill"
              :class="row.tone === 'danger' ? 'is-danger' : ''"
              :style="{ width: `${row.percent}%` }"
            />
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

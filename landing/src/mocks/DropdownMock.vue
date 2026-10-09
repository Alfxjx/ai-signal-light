<script setup lang="ts">
/** 悬浮球下拉 mock：最近活跃项目 + Kimi 5h 用量 */
const projects = [
  { name: 'ai-signal-light', phase: '编辑中', tone: 'amber' },
  { name: 'landing', phase: '思考中', tone: 'amber' },
  { name: 'opencode-plugin', phase: '空闲', tone: 'green' },
]
</script>

<template>
  <div
    class="panel ticks w-[248px] overflow-hidden"
    style="box-shadow: 0 24px 56px -28px rgba(0, 0, 0, 0.95)"
  >
    <div class="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2">
      <span class="led led-amber led-breathe" style="width: 6px; height: 6px" />
      <span class="label">kimi · 今日活跃</span>
      <span class="num ml-auto text-[10px] text-ink-500">2 / 3</span>
    </div>

    <ul class="px-2 py-2">
      <li
        v-for="p in projects"
        :key="p.name"
        class="flex items-center gap-2 rounded-sm px-1.5 py-1.5 hover:bg-white/[0.04]"
      >
        <span class="led" :class="`led-${p.tone}`" style="width: 6px; height: 6px" />
        <span class="num truncate text-[11px] text-gray-200">{{ p.name }}</span>
        <span class="num ml-auto shrink-0 text-[10px]" :class="`text-led-${p.tone}`">{{ p.phase }}</span>
      </li>
    </ul>

    <div class="border-t border-white/[0.07] px-3 py-2.5">
      <div class="flex items-baseline justify-between">
        <span class="label">kimi 5h</span>
        <span class="num text-[11px] text-led-amber">63%</span>
      </div>
      <div class="bar mt-1.5">
        <span class="bar-fill is-warn" style="width: 63%" />
      </div>
    </div>
  </div>
</template>

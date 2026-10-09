<script setup lang="ts">
/** opencode TUI 用量侧边栏 mock */
const rows = [
  { name: 'Kimi 5h', percent: 63, tone: 'ok' },
  { name: 'Kimi 周', percent: 28, tone: 'ok' },
  { name: 'MiniMax 5h', percent: 41, tone: 'ok' },
  { name: '火山方舟 周', percent: 88, tone: 'danger' },
  { name: 'DeepSeek', percent: 0, tone: 'balance', balance: '¥ 62.40' },
  { name: 'MiMo', percent: 0, tone: 'balance', balance: '¥ 18.05' },
]
</script>

<template>
  <div
    class="panel ticks w-[300px] overflow-hidden font-mono text-[11px]"
    style="box-shadow: 0 26px 60px -30px rgba(0, 0, 0, 0.95)"
  >
    <!-- 侧边栏表头 -->
    <div class="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2">
      <span class="label" style="font-size: 9px">usage</span>
      <span class="ml-auto flex gap-1">
        <span class="rounded-sm border border-white/10 px-1.5 py-px text-[9px] text-ink-400">↻ 全部</span>
        <span class="rounded-sm border border-white/10 px-1.5 py-px text-[9px] text-ink-400">⇅</span>
      </span>
    </div>

    <div class="px-3 py-2.5">
      <div
        v-for="row in rows"
        :key="row.name"
        class="flex items-center gap-2 border-b border-white/[0.04] py-1.5 last:border-b-0"
      >
        <span class="w-[92px] shrink-0 truncate text-gray-300">{{ row.name }}</span>

        <template v-if="row.tone === 'balance'">
          <span class="text-led-cyan">{{ row.balance }}</span>
        </template>
        <template v-else>
          <span class="bar !h-1 flex-1">
            <span
              class="bar-fill"
              :class="row.tone === 'danger' ? 'is-danger' : ''"
              :style="{ width: `${row.percent}%` }"
            />
          </span>
          <span class="w-9 shrink-0 text-right" :class="row.tone === 'danger' ? 'text-led-red' : 'text-ink-400'">
            {{ row.percent }}%
          </span>
        </template>

        <span class="w-3 shrink-0 text-right text-[9px] text-ink-500">↻</span>
      </div>
    </div>

    <!-- 终端上下文 -->
    <div class="border-t border-white/[0.07] bg-ink-950/60 px-3 py-2">
      <p class="text-ink-500">
        <span class="text-led-green">❯</span> 帮我把 landing 页的 README 同步一下
      </p>
      <p class="mt-1 text-ink-500">
        <span class="text-led-cyan">⏵</span> reading README.md…
      </p>
    </div>

    <div class="border-t border-white/[0.07] px-3 py-1.5">
      <p class="label" style="font-size: 9px">config: %APPDATA%\AI状态监控\config.json · 5m</p>
    </div>
  </div>
</template>

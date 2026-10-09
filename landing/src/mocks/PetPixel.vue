<script setup lang="ts">
/** 桌面宠物 mock：CSS 像素猫，idle 呼吸 / running 跳动 */
const pixels = [
  // 11 x 9 像素矩阵，1 = 主体，2 = 眼睛高光
  [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
  [0, 1, 2, 1, 1, 1, 1, 1, 2, 1, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
  [0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0],
  [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
  [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
]
</script>

<template>
  <div class="relative grid place-items-center">
    <div
      class="grid gap-[2px] rounded-sm border border-white/10 bg-ink-800/80 p-3"
      style="box-shadow: 0 20px 44px -24px rgba(0, 0, 0, 0.95)"
    >
      <template v-for="(row, y) in pixels" :key="y">
        <span
          v-for="(cell, x) in row"
          :key="x"
          class="h-2 w-2"
          :class="cell === 1 ? 'bg-led-green' : cell === 2 ? 'bg-ink-950' : 'bg-transparent'"
          :style="cell === 1 ? 'box-shadow: 0 0 6px rgba(94,240,138,0.45)' : ''"
        />
      </template>
    </div>
    <!-- 状态角标 -->
    <div class="absolute -bottom-2 -right-2 flex items-center gap-1.5 rounded-sm border border-white/10 bg-ink-900 px-2 py-1">
      <span class="led led-amber led-breathe" style="width: 6px; height: 6px" />
      <span class="label" style="font-size: 9px">running</span>
    </div>
  </div>
</template>

<style scoped>
.grid > span {
  animation: pixel-hop 1.6s ease-in-out infinite;
}
</style>

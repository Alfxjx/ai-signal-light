<script setup lang="ts">
/** 悬浮球 LED mock：拟物像素灯，四态 */
type State = 'approval' | 'editing' | 'thinking' | 'idle' | 'offline'

const props = withDefaults(defineProps<{ state?: State; size?: 'sm' | 'md' | 'lg' }>(), {
  state: 'thinking',
  size: 'md',
})

const shellSize: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-7 w-7',
  md: 'h-24 w-24',
  lg: 'h-40 w-40',
}

const bulbSize: Record<'sm' | 'md' | 'lg', number> = { sm: 7, md: 22, lg: 34 }

const stateColor: Record<State, string> = {
  approval: '#ff5c5c',
  editing: '#ffc53d',
  thinking: '#ffc53d',
  idle: '#5ef08a',
  offline: '#3a4550',
}

/** 动画类：待审核红闪 / 编辑中常亮 / 思考中黄呼吸 / 空闲绿微光 / 离线灰灭 */
const stateAnim: Record<State, string> = {
  approval: 'led-blink',
  editing: '',
  thinking: 'led-breathe',
  idle: 'led-dim',
  offline: '',
}

function bulbStyle() {
  const color = stateColor[props.state]
  const size = bulbSize[props.size]
  const halo = props.size === 'lg' ? '0 0 36px 7px' : props.size === 'md' ? '0 0 22px 4px' : '0 0 8px 2px'
  return {
    width: `${size}px`,
    height: `${size}px`,
    background: color,
    boxShadow: `0 0 ${size}px ${color}55, ${halo} ${color}88`,
  }
}
</script>

<template>
  <div
    class="relative grid place-items-center rounded-full border border-white/10 bg-gradient-to-b from-ink-700 to-ink-900"
    :class="shellSize[props.size]"
    style="box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 20px 40px -20px rgba(0, 0, 0, 0.9)"
  >
    <!-- 外圈反光 -->
    <div class="absolute inset-2 rounded-full border border-white/[0.05]" />
    <!-- 像素栅格 -->
    <div
      class="absolute inset-3 rounded-full opacity-[0.16]"
      style="
        background-image:
          linear-gradient(rgba(255, 255, 255, 0.5) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.5) 1px, transparent 1px);
        background-size: 6px 6px;
        mask-image: radial-gradient(circle at 50% 50%, transparent 30%, #000 75%);
        -webkit-mask-image: radial-gradient(circle at 50% 50%, transparent 30%, #000 75%);
      "
    />
    <!-- 灯珠 -->
    <div class="relative rounded-full" :class="stateAnim[props.state]" :style="bulbStyle()" />
  </div>
</template>

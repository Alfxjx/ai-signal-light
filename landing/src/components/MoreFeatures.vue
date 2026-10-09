<script setup lang="ts">
import ScrollReveal from './ScrollReveal.vue';
import SectionHeading from './SectionHeading.vue';

const features = [
  {
    title: 'Kimi Code (web) 实时状态',
    desc: '连本机 kimi web 服务订阅事件，WS 推送 + 3 秒 REST 校准。会话按工作目录归并成行，头部聚合成待审核 / 编辑中 / 思考中 / 空闲四态；服务不可达时整卡隐藏，不给你看假状态。',
    led: 'led-amber led-breathe',
    icon: 'M3 12h3l2-6 3 12 2.5-8 2 4H21',
  },
  {
    title: '七家额度 + 消耗节奏',
    desc: 'Kimi、MiniMax、Copilot、DeepSeek、Codex、火山方舟、MiMo 一屏排开。进度条与百分比统一是「已用 %」，并按重置时间算出消耗是偏快还是偏慢。',
    led: 'led-green led-dim',
    icon: 'M5 20V11M11 20V5M17 20V14M2 21h20',
  },
  {
    title: '顶部吸附收起',
    desc: '面板拖到屏幕顶边松手就吸附收起，屏内只剩 5px 底边把手。光标划到顶部触发带时滑出，离开且窗口不忙就重新藏回去。',
    led: 'led-cyan',
    icon: 'M4 5h16M7 12h10M10 19h4',
  },
  {
    title: '托盘悬停速览',
    desc: '鼠标悬停托盘图标即弹出简易用量：四家 mini 进度条、DeepSeek 余额、最后更新时间，不打开任何窗口就能瞄一眼。',
    led: 'led-slate',
    icon: 'M4 5h16v10H4zM9 19h6',
  },
  {
    title: 'Claude Hooks 红点提醒',
    desc: '监听 Notification / Stop / PreToolUse 事件，助手卡在需要你确认的地方时对应项目亮红点。点一下项目，或者出现更新的响应，红点自动消。',
    led: 'led-red led-blink',
    icon: 'M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  },
  {
    title: '长期有效的凭证通道',
    desc: 'Codex 自动读 ~/.codex/auth.json 并在过期时刷新；火山方舟走官方 OpenAPI V4 签名，AK/SK 长期有效，cookie 通道只作为回退。密钥只落本地配置文件。',
    led: 'led-green',
    icon: 'M14 10a4 4 0 1 1-3 6l-7 7H2v-2l1-1v-2h2v-2h2l1.5-1.5A4 4 0 0 1 14 10z',
  },
];
</script>

<template>
  <section class="relative py-24">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <ScrollReveal>
        <SectionHeading
          align="center"
          eyebrow="更多细节"
          title="面板里还塞了这些"
          desc="都是些不起眼但每天都会用到的东西。"
        />
      </ScrollReveal>

      <div class="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ScrollReveal v-for="f in features" :key="f.title">
          <article class="panel ticks group h-full p-6 transition-colors hover:border-white/20">
            <div class="flex items-center justify-between">
              <span
                class="grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-white/[0.03] text-gray-300 transition-colors group-hover:text-led-green"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path :d="f.icon" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span class="led" :class="f.led" />
            </div>
            <h3 class="mt-5 text-[15px] font-semibold text-white">{{ f.title }}</h3>
            <p class="mt-2.5 text-[13px] leading-relaxed text-gray-400">{{ f.desc }}</p>
          </article>
        </ScrollReveal>
      </div>
    </div>
  </section>
</template>

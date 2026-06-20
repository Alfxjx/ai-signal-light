<script setup lang="ts">
import { ref } from 'vue';
import ScrollReveal from './ScrollReveal.vue';

const faqs = [
  {
    question: '支持哪些 AI 平台？',
    answer: '目前支持 Claude Code、Kimi Code CLI、MiniMax 与 GitHub Copilot，后续会根据需求增加更多平台。',
  },
  {
    question: '数据是否安全？',
    answer: 'Token 与配置仅存储在本地设备，不会上传至任何服务器；局域网同步也仅在本地 WiFi 内进行。',
  },
  {
    question: '是否开源？',
    answer: '是的，项目基于 MIT 协议开源，欢迎到 GitHub 提交 Issue 或 PR。',
  },
  {
    question: '如何更新？',
    answer: '桌面端内置更新检查，也可以直接访问 GitHub Releases 页面下载最新版本。',
  },
];

const openIndex = ref<number | null>(0);

function toggle(index: number) {
  openIndex.value = openIndex.value === index ? null : index;
}
</script>

<template>
  <section id="faq" class="py-24">
    <div class="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
      <ScrollReveal>
        <div class="text-center">
          <h2 class="text-3xl font-bold sm:text-4xl">常见问题</h2>
          <p class="mt-4 text-gray-400">
            关于使用、安全与开源的疑问。
          </p>
        </div>
      </ScrollReveal>

      <div class="mt-12 space-y-4">
        <ScrollReveal v-for="(faq, index) in faqs" :key="index">
          <div class="glass-panel overflow-hidden">
            <button
              class="flex w-full items-center justify-between px-6 py-5 text-left"
              @click="toggle(index)"
            >
              <span class="font-medium">{{ faq.question }}</span>
              <span
                class="ml-4 text-xl text-gray-400 transition-transform"
                :class="{ 'rotate-45': openIndex === index }"
              >
                +
              </span>
            </button>
            <div
              class="grid transition-all duration-300 ease-in-out"
              :class="openIndex === index ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
            >
              <div class="overflow-hidden">
                <p class="px-6 pb-5 leading-relaxed text-gray-400">{{ faq.answer }}</p>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </div>
  </section>
</template>

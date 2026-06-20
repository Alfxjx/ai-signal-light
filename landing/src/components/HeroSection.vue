<script setup lang="ts">
import ScrollReveal from './ScrollReveal.vue';
</script>

<template>
  <section id="hero" class="relative flex min-h-screen items-center pt-24">
    <div class="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <ScrollReveal>
        <div class="grid items-center gap-12 lg:grid-cols-2">
          <div class="max-w-2xl">
            <h1 class="text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
              <span class="bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
                AI 状态随身看
              </span>
            </h1>
            <p class="mt-6 text-lg leading-relaxed text-gray-300 sm:text-xl">
              把 AI 助手的工作状态装进口袋，项目跑没跑、用量够不够，一眼知道。
            </p>
            <div class="mt-8 flex flex-wrap gap-4">
              <a
                href="https://github.com/Alfxjx/ai-signal-light/releases"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center justify-center rounded-lg bg-accent-green px-6 py-3 font-semibold text-[#0a0a12] transition-transform hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent-green/20"
              >
                免费下载
              </a>
              <a
                href="https://github.com/Alfxjx/ai-signal-light"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/5 px-6 py-3 font-medium text-white transition-colors hover:bg-white/10"
              >
                GitHub
              </a>
            </div>
          </div>

          <div class="relative flex justify-center">
            <div class="absolute inset-0 rounded-full bg-accent-green/10 blur-3xl"></div>
            <img
              src="/src/assets/technical-support.png"
              alt="AI 状态监控"
              class="relative h-64 w-64 animate-bounce-slow sm:h-80 sm:w-80 lg:h-96 lg:w-96"
            />
          </div>
        </div>
      </ScrollReveal>
    </div>
  </section>
</template>

<style scoped>
@keyframes bounce-slow {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-12px);
  }
}

.animate-bounce-slow {
  animation: bounce-slow 4s ease-in-out infinite;
}
</style>

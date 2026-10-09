<script setup lang="ts">
withDefaults(
  defineProps<{
    eyebrow?: string;
    title: string;
    desc?: string;
    align?: 'left' | 'center';
  }>(),
  { align: 'left' }
);
</script>

<template>
  <div :class="align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'">
    <p v-if="eyebrow" class="label flex items-center gap-2" :class="align === 'center' ? 'justify-center' : ''">
      <span class="inline-block h-px w-6 bg-led-green/60" />
      {{ eyebrow }}
    </p>
    <h2 class="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-[32px]">{{ title }}</h2>
    <p v-if="desc" class="mt-4 text-[15px] leading-relaxed text-gray-400">{{ desc }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const root = ref<HTMLElement | null>(null);
const isVisible = ref(false);

onMounted(() => {
  if (!root.value || typeof IntersectionObserver === 'undefined') {
    isVisible.value = true;
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          isVisible.value = true;
          observer.disconnect();
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  );
  observer.observe(root.value);
});
</script>

<template>
  <div ref="root" class="section-reveal" :class="{ 'is-visible': isVisible }">
    <slot />
  </div>
</template>

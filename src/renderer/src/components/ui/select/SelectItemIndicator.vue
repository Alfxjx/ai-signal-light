<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { SelectItemIndicator } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<{ class?: HTMLAttributes['class'] }>();
</script>

<template>
  <SelectItemIndicator :class="cn('absolute right-2 flex h-3.5 w-3.5 items-center justify-center', props.class)">
    <slot />
  </SelectItemIndicator>
</template>

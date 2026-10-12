<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { SelectTrigger, type SelectTriggerProps } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<SelectTriggerProps & { class?: HTMLAttributes['class'] }>();
</script>

<template>
  <SelectTrigger
    v-bind="props"
    :class="cn(
      'flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
      props.class
    )"
  >
    <slot />
  </SelectTrigger>
</template>

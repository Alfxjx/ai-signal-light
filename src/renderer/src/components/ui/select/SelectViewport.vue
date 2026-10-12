<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { SelectViewport, type SelectViewportProps } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<SelectViewportProps & { class?: HTMLAttributes['class'] }>();
</script>

<template>
  <SelectViewport v-bind="props" :class="cn('p-1', props.class)" />
</template>

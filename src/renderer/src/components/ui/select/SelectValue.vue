<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { SelectValue, type SelectValueProps } from 'reka-ui';

const props = defineProps<SelectValueProps & { class?: HTMLAttributes['class'] }>();
</script>

<template>
  <SelectValue v-bind="props" :class="props.class" />
</template>

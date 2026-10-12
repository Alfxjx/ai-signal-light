<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { SelectItemText, type SelectItemTextProps } from 'reka-ui';

const props = defineProps<SelectItemTextProps & { class?: HTMLAttributes['class'] }>();
</script>

<template>
  <SelectItemText v-bind="props" :class="props.class" />
</template>

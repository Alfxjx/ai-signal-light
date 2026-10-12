<script setup lang="ts">
import { reactive } from 'vue';
import type { HTMLAttributes } from 'vue';
import { SelectItem, useForwardPropsEmits, type SelectItemEmits, type SelectItemProps } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<SelectItemProps & { class?: HTMLAttributes['class'] }>();
const emits = defineEmits<SelectItemEmits>();

const delegated = reactive(useForwardPropsEmits(props, emits));
</script>

<template>
  <SelectItem
    v-bind="delegated"
    :class="cn(
      'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      props.class
    )"
  >
    <slot />
  </SelectItem>
</template>

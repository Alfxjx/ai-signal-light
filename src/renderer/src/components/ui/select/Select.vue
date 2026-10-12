<script setup lang="ts">
import { reactive } from 'vue';
import { SelectRoot, useForwardPropsEmits, type SelectRootEmits, type SelectRootProps } from 'reka-ui';

const props = defineProps<SelectRootProps>();
const emits = defineEmits<SelectRootEmits>();

const delegated = reactive(useForwardPropsEmits(props, emits));
</script>

<template>
  <SelectRoot v-bind="delegated">
    <slot />
  </SelectRoot>
</template>

<script setup lang="ts">
// Inline accent-colored span for use inside markdown/prose, e.g.
//   Row Level Security is <Accent color="emerald">the anchor</Accent> tonight.
import { computed } from 'vue'
import { accentHex } from '../accents'

const props = withDefaults(defineProps<{
  color?: string
}>(), {
  color: undefined,
})

const style = computed(() => ({ color: accentHex(props.color) }))
</script>

<template>
  <span class="font-600" :style="style"><slot /></span>
</template>

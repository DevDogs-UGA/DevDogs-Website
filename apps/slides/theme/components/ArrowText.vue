<script setup lang="ts">
// Plain text with each "→" drawn as a Phosphor arrow, for strings that come
// from frontmatter (titlebars, labels). Slide bodies get the same swap from
// setup/transformers.ts.
import { computed } from 'vue'

const props = defineProps<{ text?: string }>()
const parts = computed(() => (props.text ?? '').split(/\s*→\s*/))
</script>

<template>
  <template v-for="(part, i) in parts" :key="i">
    <ph-arrow-right-bold v-if="i > 0" class="dd-arrow" />{{ part }}
  </template>
</template>

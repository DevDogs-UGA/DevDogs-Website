<script setup lang="ts">
// Fallback layout for slides with no explicit `layout:` — still dark themed
// and accent-aware, so a forgotten layout doesn't fall back to a white slide.
// Frontmatter: accent
import { computed } from 'vue'
import { accentHex } from '../accents'

const props = withDefaults(defineProps<{
  accent?: string
}>(), {
  accent: undefined,
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))
</script>

<template>
  <div class="slidev-layout dd-default relative overflow-hidden" :style="style">
    <div class="dd-corner-wash" />
    <div class="dd-content h-full">
      <slot />
    </div>
  </div>
</template>

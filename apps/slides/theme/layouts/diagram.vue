<script setup lang="ts">
// Heading + a diagram area (image, mermaid block, or hand-built HTML/CSS)
// with an optional caption underneath.
// Frontmatter: accent, caption
//   ---
//   layout: diagram
//   accent: emerald
//   caption: Client → Supabase → Postgres
//   ---
//   # Where it fits
//
//   ![architecture](/diagrams/supabase-arch.svg)
import { computed } from 'vue'
import { accentHex } from '../accents'

const props = withDefaults(defineProps<{
  accent?: string
  caption?: string
}>(), {
  accent: undefined,
  caption: undefined,
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))
</script>

<template>
  <div class="slidev-layout dd-diagram relative overflow-hidden" :style="style">
    <div class="dd-corner-wash" />
    <div class="dd-content h-full flex flex-col">
      <slot />
      <p v-if="caption" class="mt-auto text-center text-sm text-dd-muted">
        {{ caption }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.dd-diagram :deep(img) {
  margin: 0 auto;
  max-height: 60%;
  object-fit: contain;
}
</style>

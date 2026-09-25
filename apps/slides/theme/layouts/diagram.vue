<script setup lang="ts">
// Heading + a diagram area (image, mermaid block, or hand-built HTML/CSS)
// with an optional caption underneath.
// Frontmatter: accent, caption, chip, chrome, wash (see LAYOUTS.md)
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
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'

const props = withDefaults(defineProps<{
  accent?: string
  caption?: string
  chip?: string
  chrome?: boolean
  wash?: 'corner' | 'site' | 'template'
}>(), {
  accent: undefined,
  caption: undefined,
  chip: undefined,
  chrome: true,
  wash: undefined,
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))
</script>

<template>
  <div class="slidev-layout dd-diagram relative overflow-hidden" :style="style">
    <Wash :accent="accent" :wash="wash" />
    <Chrome v-if="chrome" :accent="accent" :chip="chip" />
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

<script setup lang="ts">
// Upcoming-events slide. Write markdown headings/lists in the default slot;
// wrap each event's type label in <Chip type="workshop"> to get the
// site-legend accent automatically (workshop=emerald, dev session=cyan, ...).
// Frontmatter: accent (slide-level wash; independent of each Chip's color),
// chip, chrome, wash (see LAYOUTS.md)
//   ---
//   layout: events
//   accent: amber
//   ---
//   ### Next Monday — Supabase Workshop
//   <Chip type="workshop" /> DLW 124 · 6:00 PM
//
//   ### Next Thursday — Dev Session
//   <Chip type="dev session" /> DLW 124 · 6:00 PM
import { computed } from 'vue'
import { accentHex } from '../accents'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'

const props = withDefaults(defineProps<{
  accent?: string
  chip?: string
  chrome?: boolean
  wash?: 'site' | 'template'
}>(), {
  accent: undefined,
  chip: undefined,
  chrome: true,
  wash: undefined,
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))
</script>

<template>
  <div class="slidev-layout dd-events relative overflow-hidden" :style="style">
    <Wash :accent="accent" :wash="wash" />
    <Chrome v-if="chrome" :accent="accent" :chip="chip" />
    <div class="dd-content h-full flex flex-col justify-center">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.dd-events :deep(h3) {
  margin-top: 1.25rem;
}

.dd-events :deep(h3:first-child) {
  margin-top: 0;
}
</style>

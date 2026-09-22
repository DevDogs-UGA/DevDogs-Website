<script setup lang="ts">
// Agenda slide — write a normal markdown list in the default slot; items are
// auto-numbered in the accent color.
// Frontmatter: accent
//   ---
//   layout: agenda
//   accent: cyan
//   ---
//   # Tonight
//
//   - Supabase, the tour
//   - Build against it
//   - Dashboard tour
//   - How the monorepo uses it
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
  <div class="slidev-layout dd-agenda relative overflow-hidden" :style="style">
    <div class="dd-corner-wash" />
    <div class="dd-content h-full flex flex-col justify-center">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.dd-agenda :deep(ul) {
  list-style: none;
  counter-reset: dd-agenda-item;
  padding-left: 0;
}

.dd-agenda :deep(li) {
  counter-increment: dd-agenda-item;
  margin-left: 0;
  padding: 0.5em 0;
  font-size: 1.5rem;
  display: flex;
  align-items: baseline;
  gap: 0.75em;
}

.dd-agenda :deep(li)::before {
  content: counter(dd-agenda-item, decimal-leading-zero);
  color: var(--accent);
  font-family: 'Cascadia Code', monospace;
  font-weight: 700;
}
</style>

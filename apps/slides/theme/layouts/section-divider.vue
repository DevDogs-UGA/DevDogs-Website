<script setup lang="ts">
// Section break slide — big accent-colored kicker + heading.
// Frontmatter: accent, kicker (small label above the heading, e.g. "01")
//   ---
//   layout: section-divider
//   accent: emerald
//   kicker: "01 · Tour"
//   ---
//   # Supabase, the tour
import { computed } from 'vue'
import { accentHex } from '../accents'

const props = withDefaults(defineProps<{
  accent?: string
  kicker?: string
}>(), {
  accent: undefined,
  kicker: undefined,
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))
</script>

<template>
  <div class="slidev-layout dd-section-divider relative overflow-hidden" :style="style">
    <div class="dd-corner-wash" />
    <div class="dd-content h-full flex flex-col justify-center items-start">
      <p v-if="kicker" class="mb-2 text-lg font-600 tracking-widest uppercase" :style="{ color: 'var(--accent)' }">
        {{ kicker }}
      </p>
      <div class="text-6xl">
        <slot />
      </div>
    </div>
  </div>
</template>

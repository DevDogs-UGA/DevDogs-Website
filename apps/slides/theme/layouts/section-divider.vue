<script setup lang="ts">
// Section break slide — big accent-colored kicker + heading.
// Frontmatter: accent, kicker (small label above the heading, e.g. "01"),
// chip, chrome, wash (see LAYOUTS.md)
//   ---
//   layout: section-divider
//   accent: emerald
//   kicker: "01 · Tour"
//   ---
//   # Supabase, the tour
import { computed } from 'vue'
import { accentHex } from '../accents'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'

const props = withDefaults(defineProps<{
  accent?: string
  kicker?: string
  chip?: string
  chrome?: boolean
  wash?: 'site' | 'template'
}>(), {
  accent: undefined,
  kicker: undefined,
  chip: undefined,
  chrome: true,
  wash: undefined,
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))
</script>

<template>
  <div class="slidev-layout dd-section-divider relative overflow-hidden" :style="style">
    <Wash :accent="accent" :wash="wash" />
    <Chrome v-if="chrome" :accent="accent" :chip="chip" />
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

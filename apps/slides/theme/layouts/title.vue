<script setup lang="ts">
// Deck-opening / meeting-title slide.
// Frontmatter: accent, subtitle, chip, chrome, wash (see LAYOUTS.md)
//   ---
//   layout: title
//   accent: emerald
//   subtitle: Workshops · DLW 124 · 6:00 PM
//   ---
//   # Supabase
import { computed } from 'vue'
import { accentHex } from '../accents'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'

const props = withDefaults(defineProps<{
  accent?: string
  subtitle?: string
  chip?: string
  chrome?: boolean
  wash?: 'corner' | 'site' | 'template'
}>(), {
  accent: undefined,
  subtitle: undefined,
  chip: undefined,
  chrome: true,
  wash: undefined,
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))
</script>

<template>
  <div class="slidev-layout dd-title relative overflow-hidden" :style="style">
    <Wash :accent="accent" :wash="wash" />
    <Chrome v-if="chrome" :accent="accent" :chip="chip" />
    <div class="dd-edge-bar" />
    <div class="dd-content h-full flex flex-col justify-center pl-6">
      <slot />
      <p v-if="subtitle" class="mt-6 text-xl text-dd-muted">
        {{ subtitle }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.dd-title :deep(h1) {
  font-size: 5.5rem;
  line-height: 1.05;
  margin-bottom: 0;
}
</style>


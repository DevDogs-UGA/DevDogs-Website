<script setup lang="ts">
// Deck-opening / meeting-title slide.
// Frontmatter: accent, subtitle
//   ---
//   layout: title
//   accent: emerald
//   subtitle: Workshops · DLW 124 · 6:00 PM
//   ---
//   # Supabase
import { computed } from 'vue'
import { accentHex } from '../accents'

const props = withDefaults(defineProps<{
  accent?: string
  subtitle?: string
}>(), {
  accent: undefined,
  subtitle: undefined,
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))
</script>

<template>
  <div class="slidev-layout dd-title relative overflow-hidden" :style="style">
    <div class="dd-corner-wash" />
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


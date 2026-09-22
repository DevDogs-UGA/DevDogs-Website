<script setup lang="ts">
// Single big idea, centered. For one-liner concept slides.
// Frontmatter: accent
//   ---
//   layout: statement
//   accent: emerald
//   ---
//   # A hosted Postgres database with auth, storage, realtime, and
//   # auto-generated APIs on top.
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
  <div class="slidev-layout dd-statement relative overflow-hidden" :style="style">
    <div class="dd-corner-wash" />
    <div class="dd-content h-full flex flex-col justify-center items-center text-center">
      <div class="max-w-4xl text-4xl leading-snug">
        <slot />
      </div>
    </div>
  </div>
</template>

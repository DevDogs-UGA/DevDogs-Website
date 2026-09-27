<script setup lang="ts">
// Single big idea, centered. For one-liner concept slides.
// Frontmatter: accent, chip, chrome, wash (see LAYOUTS.md)
//   ---
//   layout: statement
//   accent: emerald
//   ---
//   # A hosted Postgres database with auth, storage, realtime, and
//   # auto-generated APIs on top.
import { computed } from 'vue'
import { accentHex } from '../accents'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'

const props = withDefaults(defineProps<{
  accent?: string
  chip?: string
  chrome?: boolean
  wash?: 'corner' | 'site' | 'template'
}>(), {
  accent: undefined,
  chip: undefined,
  chrome: true,
  wash: undefined,
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))
</script>

<template>
  <div class="slidev-layout dd-statement relative overflow-hidden" :style="style">
    <Wash :accent="accent" :wash="wash" />
    <Chrome v-if="chrome" :accent="accent" :chip="chip" />
    <div class="dd-content h-full flex flex-col justify-center items-center text-center">
      <div class="max-w-4xl text-4xl leading-snug">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* A statement with a heading reads the heading big and the paragraph under
   it as supporting text: smaller, and balanced across its lines. A bare
   statement (no heading) keeps the full size. */
.dd-statement :deep(h1 ~ p),
.dd-statement :deep(h1 ~ * p) {
  max-width: 40rem;
  margin: 1rem auto 0;
  font-size: 1.2rem;
  line-height: 1.5;
  text-wrap: balance;
}

.dd-statement :deep(p) {
  text-wrap: balance;
}
</style>

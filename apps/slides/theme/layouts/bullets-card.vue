<script setup lang="ts">
// Left accent bullet list, right a #1D161E card with a dim caps header and
// its own mini list or code block. Good for "here's the idea, here's the
// recipe" slides.
// Frontmatter: accent, cardTitle (the card's dim caps header), chip, chrome,
// wash (see LAYOUTS.md)
// Slots: default (left bullets), `card` (right card body — a markdown list,
// a fenced code block, whatever fits)
//   ---
//   layout: bullets-card
//   accent: emerald
//   cardTitle: What you'll need
//   ---
//   - A Supabase project
//   - The publishable key
//   - Five minutes
//
//   ::card::
//   1. `supabase init`
//   2. `supabase start`
//   3. `devtools oauth`
import { computed } from 'vue'
import { accentHex } from '../accents'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'

const props = withDefaults(defineProps<{
  accent?: string
  cardTitle?: string
  chip?: string
  chrome?: boolean
  wash?: 'corner' | 'site' | 'template'
}>(), {
  accent: undefined,
  cardTitle: undefined,
  chip: undefined,
  chrome: true,
  wash: undefined,
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))
</script>

<template>
  <div class="slidev-layout dd-bullets-card relative overflow-hidden" :style="style">
    <Wash :accent="accent" :wash="wash" />
    <Chrome v-if="chrome" :accent="accent" :chip="chip" />
    <div class="dd-content h-full grid grid-cols-2 gap-8 items-center">
      <div class="dd-bullets">
        <slot />
      </div>
      <div class="dd-card">
        <p v-if="cardTitle" class="dd-card-header">{{ cardTitle }}</p>
        <div class="dd-card-body">
          <slot name="card" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dd-bullets :deep(ul) {
  list-style: none;
  padding-left: 0;
}

.dd-bullets :deep(li) {
  position: relative;
  margin: 0.6em 0;
  padding-left: 1.25em;
  font-size: 1.25rem;
}

.dd-bullets :deep(li)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.5em;
  width: 0.5em;
  height: 0.5em;
  border-radius: 999px;
  background: var(--accent);
}

.dd-card {
  background: var(--dd-card-fill);
  border: 1px solid var(--dd-hairline);
  border-radius: 1rem;
  padding: 1.5rem;
}

.dd-card-header {
  margin: 0 0 1rem 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dd-grey-dim);
}

.dd-card-body :deep(ol) {
  padding-left: 1.25em;
}

.dd-card-body :deep(li) {
  margin: 0.4em 0;
}

.dd-card-body :deep(pre) {
  margin: 0;
}
</style>

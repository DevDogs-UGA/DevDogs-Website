<script setup lang="ts">
// The week's competition features, split by project: DogDays (web) on the
// left, DogPack (mobile) on the right, each under its own mark and name in
// the platform's project colours. Track mode shows each laptop only its
// own project, full width; no track (the PDF) shows both.
// Frontmatter: accent, heading, chip, chrome, wash (see LAYOUTS.md)
// Slots: default (DogDays), `mobile` (DogPack)
//   ---
//   layout: features
//   heading: This Week's Features
//   ---
//   - Feature one
//
//   ::mobile::
//
//   - Feature one
import { computed } from 'vue'
import { accentHex } from '../accents'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'
import DogDaysMark from '../components/DogDaysMark.vue'
import DogPackMark from '../components/DogPackMark.vue'
import { track } from '../lib/track'

const props = withDefaults(defineProps<{
  accent?: string
  heading?: string
  chip?: string
  chrome?: boolean
  wash?: 'corner' | 'site' | 'template'
}>(), {
  accent: undefined,
  heading: undefined,
  chip: undefined,
  chrome: true,
  wash: undefined,
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))
const showWeb = computed(() => track.value !== 'mobile')
const showMobile = computed(() => track.value !== 'web')
</script>

<template>
  <div class="slidev-layout dd-features relative overflow-hidden" :style="style">
    <Wash :accent="accent" :wash="wash" />
    <Chrome v-if="chrome" :accent="accent" :chip="chip" />
    <div class="dd-content h-full flex flex-col">
      <h2 v-if="heading" class="dd-window-heading">{{ heading }}</h2>
      <div class="dd-features-split flex-1 min-h-0" :class="{ 'dd-features-both': showWeb && showMobile }">
        <section v-if="showWeb" class="dd-features-half dd-features-dogdays">
          <div class="dd-features-glow" />
          <h3 class="dd-features-name">
            <DogDaysMark class="dd-features-mark" />DogDays
          </h3>
          <div class="dd-features-body">
            <slot />
          </div>
        </section>
        <section v-if="showMobile" class="dd-features-half dd-features-dogpack">
          <div class="dd-features-glow" />
          <h3 class="dd-features-name">
            <DogPackMark class="dd-features-mark" />DogPack
          </h3>
          <div class="dd-features-body">
            <slot name="mobile" />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dd-features-split {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

.dd-features-both {
  grid-template-columns: 1fr 1fr;
}

.dd-features-dogdays {
  --project: var(--dd-red);
}

.dd-features-dogpack {
  --project: var(--dd-purple);
}

.dd-features-half {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  padding: 1.1rem 1.4rem;
  border-radius: 0.9rem;
  background: var(--dd-card-fill);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--project) 40%, transparent);
}

.dd-features-glow {
  position: absolute;
  inset: -40% 0 auto;
  height: 80%;
  z-index: -1;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--project) 22%, transparent), transparent);
  filter: blur(24px);
  pointer-events: none;
}

.dd-features-name {
  /* Inline-flex, as on the preshow: the mark is an SVG (block by default
     here) that has to sit on the name's baseline. */
  display: inline-flex;
  align-items: baseline;
  margin: 0 0 0.75rem;
  font-family: 'Alan Sans', 'Hanken Grotesk', sans-serif;
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--project);
}

.dd-features-mark {
  margin-right: 0.3em;
}

.dd-features-body :deep(ul),
.dd-features-body :deep(ol) {
  margin: 0;
  padding-left: 1.2em;
}

.dd-features-body :deep(li) {
  margin: 0.45em 0;
  font-size: 1.1rem;
}

.dd-features-body :deep(li)::marker {
  color: var(--project);
}
</style>

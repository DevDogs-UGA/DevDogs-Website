<script setup lang="ts">
// Pre-show slide, shown before the talk starts while people are finding
// seats. Points each laptop at where its own projector/table is, using
// track mode (see LAYOUTS.md and theme/lib/track.ts):
//   - ?track=web    → "DogDays sits here ←"
//   - ?track=mobile → "→ DogPack sits here"
//   - no track set  → both halves, side by side (so the PDF export and a
//     shared/no-param view show the whole room layout)
// Frontmatter: accent, chip, chrome, wash (see LAYOUTS.md)
import { computed } from 'vue'
import { accentHex } from '../accents'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'
import { track } from '../lib/track'

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

const showWeb = computed(() => track.value !== 'mobile')
const showMobile = computed(() => track.value !== 'web')
</script>

<template>
  <div class="slidev-layout dd-preshow relative overflow-hidden" :style="style">
    <Wash :accent="accent" :wash="wash" />
    <Chrome v-if="chrome" :accent="accent" :chip="chip" />
    <div
      class="dd-content h-full grid items-center"
      :style="{ gridTemplateColumns: showWeb && showMobile ? '1fr 1fr' : '1fr' }"
    >
      <div v-if="showWeb" class="dd-preshow-half">
        <p class="dd-preshow-line">DogDays sits here <span class="dd-preshow-arrow">←</span></p>
      </div>
      <div v-if="showMobile" class="dd-preshow-half">
        <p class="dd-preshow-line"><span class="dd-preshow-arrow">→</span> DogPack sits here</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dd-preshow-half {
  text-align: center;
}

.dd-preshow-line {
  font-family: 'Alan Sans', 'Hanken Grotesk', sans-serif;
  font-weight: 800;
  font-size: 3rem;
  color: var(--accent);
}

.dd-preshow-arrow {
  color: var(--dd-ink);
}
</style>

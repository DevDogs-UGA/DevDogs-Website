<script setup lang="ts">
// Every content slide's fixed decoration: the DevDogs mark + wordmark in the
// top-left corner, and the GDG on Campus mark + two-line footer in the
// bottom-right. Marks come straight from the workspace @devdogsuga/brand
// package — never redrawn here, so a brand refresh there is a dependency bump
// away from showing up in the deck.
//
// A slide can turn this whole block off with `chrome: false` in its
// frontmatter (see each layout's props).
import { MARK, WORDMARK_ON_DARK, GDG_MARK } from '@devdogsuga/brand'
import Chip from './Chip.vue'

const props = withDefaults(defineProps<{
  accent?: string
  // Text for the top-right pill (e.g. "WORKSHOP", "AGENDA"). Omit to skip it.
  chip?: string
}>(), {
  accent: undefined,
  chip: undefined,
})
</script>

<template>
  <div class="dd-chrome-mark">
    <img :src="MARK.src" :width="MARK.width" :height="MARK.height" alt="" />
    <img
      :src="WORDMARK_ON_DARK.src"
      :width="WORDMARK_ON_DARK.width"
      :height="WORDMARK_ON_DARK.height"
      alt="DevDogs"
    />
  </div>
  <div class="dd-chrome-footer">
    <div class="dd-chrome-footer-lines">
      <div class="dd-line-1">Google Developer Groups</div>
      <div class="dd-line-2">On Campus · University of Georgia</div>
    </div>
    <img :src="GDG_MARK.src" :width="GDG_MARK.width" :height="GDG_MARK.height" alt="GDG on Campus" />
  </div>
  <div v-if="chip" class="dd-chip-slot">
    <Chip variant="solid" :color="accent">{{ chip }}</Chip>
  </div>
</template>

<style scoped>
.dd-chip-slot {
  position: absolute;
  top: var(--dd-chrome-inset);
  right: var(--dd-chrome-inset);
  z-index: 2;
  height: var(--dd-chrome-band);
  display: flex;
  align-items: center;
}
</style>

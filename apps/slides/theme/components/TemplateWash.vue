<script setup lang="ts">
// The other wash option: the pptx template's own baked-in background PNGs,
// one per accent, extracted from `Slides Template.pptx` (ppt/media, the image
// each DD_<ACCENT> slideLayout points at). Used when a slide/deck opts into
// `themeConfig.wash: 'template'` instead of the default site-blob wash.
import { computed } from 'vue'
import type { AccentName } from '../accents'
import { DEFAULT_ACCENT } from '../accents'

import purple from '../assets/template-wash/purple.png'
import cyan from '../assets/template-wash/cyan.png'
import amber from '../assets/template-wash/amber.png'
import emerald from '../assets/template-wash/emerald.png'
import red from '../assets/template-wash/red.png'

const IMAGES: Record<AccentName, string> = { purple, cyan, amber, emerald, red }

const props = withDefaults(defineProps<{ accent?: string }>(), { accent: undefined })

const src = computed(() => {
  const name = (props.accent as AccentName) || DEFAULT_ACCENT
  return IMAGES[name] ?? IMAGES[DEFAULT_ACCENT]
})
</script>

<template>
  <div class="dd-wash dd-wash-template">
    <img :src="src" alt="" />
  </div>
</template>

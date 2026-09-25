<script setup lang="ts">
// Picks the background wash every layout uses behind its content: the
// default 'corner' wash (the template's corner glow rebuilt in CSS, with
// companion blobs), 'site' (the website's blob gradients, static), or
// 'template' (the pptx deck template's own background PNGs).
//
// The mode comes from the deck-wide `themeConfig: { wash: ... }` headmatter
// (Slidev exposes deck headmatter as `configs` from '@slidev/client'), or can
// be overridden per-slide with a `wash` frontmatter key on the slide itself —
// the per-slide prop wins when set.
import { computed } from 'vue'
import { configs } from '@slidev/client'
import CornerWash from './CornerWash.vue'
import SiteWash from './SiteWash.vue'
import TemplateWash from './TemplateWash.vue'

const props = withDefaults(defineProps<{
  accent?: string
  wash?: 'corner' | 'site' | 'template'
}>(), {
  accent: undefined,
  wash: undefined,
})

const mode = computed(() => props.wash ?? configs.themeConfig?.wash ?? 'corner')
</script>

<template>
  <TemplateWash v-if="mode === 'template'" :accent="accent" />
  <SiteWash v-else-if="mode === 'site'" :accent="accent" />
  <CornerWash v-else :accent="accent" />
</template>

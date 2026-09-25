<script setup lang="ts">
// Picks between the two background washes every layout uses behind its
// content: the default 'site' wash (the website's blob gradients, static) or
// 'template' (the pptx deck template's own background PNGs).
//
// The mode comes from the deck-wide `themeConfig: { wash: ... }` headmatter
// (Slidev exposes deck headmatter as `configs` from '@slidev/client'), or can
// be overridden per-slide with a `wash` frontmatter key on the slide itself —
// the per-slide prop wins when set.
import { computed } from 'vue'
import { configs } from '@slidev/client'
import SiteWash from './SiteWash.vue'
import TemplateWash from './TemplateWash.vue'

const props = withDefaults(defineProps<{
  accent?: string
  wash?: 'site' | 'template'
}>(), {
  accent: undefined,
  wash: undefined,
})

const mode = computed(() => props.wash ?? configs.themeConfig?.wash ?? 'site')
</script>

<template>
  <TemplateWash v-if="mode === 'template'" :accent="accent" />
  <SiteWash v-else :accent="accent" />
</template>

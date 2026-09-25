<script setup lang="ts">
// Tells the code blocks inside it which Discord channel they post to and
// which file they come from (see lib/snippets.ts). Renders no element.
import type { TrackName } from '../lib/track'
import { provideSnippetScope } from '../lib/snippets'

const props = defineProps<{
  track?: TrackName
  file?: string
}>()

provideSnippetScope(props)
</script>

<template>
  <slot />
</template>

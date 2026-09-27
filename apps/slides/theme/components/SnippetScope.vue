<script setup lang="ts">
// Tells the code blocks inside it which Discord channel they post to and
// which file they come from (see lib/snippets.ts), and where a <CodeTips>
// banner among them goes (`tips`, an element id; see lib/tips.ts).
// Renders no element.
import type { TrackName } from '../lib/track'
import { provideSnippetScope } from '../lib/snippets'
import { provideTipsTarget } from '../lib/tips'

const props = defineProps<{
  track?: TrackName
  file?: string
  tips?: string
}>()

provideSnippetScope(props)
provideTipsTarget(props.tips)
</script>

<template>
  <slot />
</template>

<script setup lang="ts">
// Overrides Slidev's built-in ShikiMagicMove (a theme component with the
// same name wins) to add, as CodeBlockWrapper.vue does for plain blocks:
//
// - Inside a code window, the editor viewport (lib/viewport.ts).
// - Copy and the Discord button (see lib/snippets.ts), both taking the
//   final step's focus.
//
// Each step is a whole file from the workshop repos (setup/transformers.ts),
// so its line numbers are already the file's own. Everything else passes
// straight through to the built-in.
import { computed, ref, useAttrs } from 'vue'
import lz from 'lz-string'
import Builtin from '@slidev/client/builtin/ShikiMagicMove.vue'
import SnippetCopy from './SnippetCopy.vue'
import SnippetPost from './SnippetPost.vue'
import { focusOf, useSnippetScope, type Snippet } from '../lib/snippets'
import { useCodeViewport } from '../lib/viewport'

defineOptions({ inheritAttrs: false })

interface Step { code: string, lang?: string }

const attrs = useAttrs()
const scope = useSnippetScope()
const root = ref<HTMLElement>()
const track = ref<HTMLElement>()
const { offset, animate } = useCodeViewport(root, track)

// Slidev writes these kebab-case.
const ranges = computed(() => (attrs.stepRanges ?? attrs['step-ranges'] ?? []) as string[][])
const steps = computed(() =>
  JSON.parse(lz.decompressFromBase64(String(attrs.stepsLz ?? attrs['steps-lz']))) as Step[])

function snippet(): Snippet {
  const last = steps.value.length - 1
  const step = steps.value[last]
  return {
    ...focusOf(step.code, 1, ranges.value[last] ?? []),
    lang: step.lang,
    file: scope.file,
    track: scope.track,
  }
}
</script>

<template>
  <div ref="root" class="dd-code-block group">
    <div
      ref="track"
      class="dd-code-track"
      :class="{ 'dd-code-track-animate': animate }"
      :style="{ transform: `translateY(${-offset}px)` }"
    >
      <Builtin v-bind="attrs" />
    </div>
    <SnippetCopy :snippet="snippet" />
    <SnippetPost :snippet="snippet" />
  </div>
</template>

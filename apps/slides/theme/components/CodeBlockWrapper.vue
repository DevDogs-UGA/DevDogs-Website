<script setup lang="ts">
// Overrides Slidev's built-in CodeBlockWrapper (every fenced code block
// renders through it; a theme component with the same name wins) to add the
// Discord post button. Everything else passes straight through to the
// built-in, so line highlighting, `{lines:true,startLine:N}` and the copy
// button behave exactly as upstream.
import { computed, ref, useAttrs } from 'vue'
import Builtin from '@slidev/client/builtin/CodeBlockWrapper.vue'
import SnippetPost from './SnippetPost.vue'
import { focusOf, useSnippetScope, type Snippet } from '../lib/snippets'

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const scope = useSnippetScope()
const root = ref<HTMLElement>()

const ranges = computed(() => (attrs.ranges as string[] | undefined) ?? [])
const startLine = computed(() => Number(attrs.startLine ?? attrs['start-line'] ?? 1))

function snippet(): Snippet {
  const code = root.value?.querySelector('.slidev-code code')
  const lines = Array.from(code?.querySelectorAll(':scope > .line') ?? [], line => line.textContent ?? '')
  const lang = code?.className.match(/language-(\S+)/)?.[1]
  return {
    ...focusOf(lines.join('\n'), startLine.value, ranges.value),
    lang,
    file: scope.file,
    track: scope.track,
  }
}
</script>

<template>
  <div ref="root" class="dd-code-block relative">
    <Builtin v-bind="attrs">
      <slot />
    </Builtin>
    <SnippetPost :snippet="snippet" />
  </div>
</template>

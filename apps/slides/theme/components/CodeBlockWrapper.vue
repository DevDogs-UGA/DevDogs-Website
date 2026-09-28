<script setup lang="ts">
// Overrides Slidev's built-in CodeBlockWrapper (every fenced code block
// renders through it; a theme component with the same name wins). Line
// highlighting, `{lines:true,startLine:N}` and click ranges stay the
// built-in's; on top of them:
//
// - Inside a code window the block is a viewport onto a whole file that
//   pans to the highlighted lines (lib/viewport.ts).
// - Shell blocks get prompts and an idle cursor (lib/shell.ts). Two extra
//   options set where the session starts: ```bash {*}{cwd:'~/DevDogsUGA',branch:'main'}
// - Copy and the Discord button take the block's focus, not the whole file.
import { computed, onMounted, ref, useAttrs } from 'vue'
import Builtin from '@slidev/client/builtin/CodeBlockWrapper.vue'
import SnippetCopy from './SnippetCopy.vue'
import SnippetPost from './SnippetPost.vue'
import { focusOf, lineText, useSnippetScope, type Snippet } from '../lib/snippets'
import { useCodeViewport } from '../lib/viewport'
import { decorateShell, SHELL_LANGS } from '../lib/shell'
import { track as deckTrack } from '../lib/track'

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const scope = useSnippetScope()
const root = ref<HTMLElement>()
const track = ref<HTMLElement>()
const { offset, animate } = useCodeViewport(root, track)

const ranges = computed(() => (attrs.ranges as string[] | undefined) ?? [])
const startLine = computed(() => Number(attrs.startLine ?? attrs['start-line'] ?? 1))
const passthrough = computed(() => {
  const { cwd: _cwd, branch: _branch, ...rest } = attrs
  return rest
})

const code = () => root.value?.querySelector<HTMLElement>('.slidev-code code')
const lang = ref<string>()
const isShell = computed(() => !!lang.value && SHELL_LANGS.includes(lang.value))

onMounted(() => {
  const el = code()
  lang.value = el?.className.match(/language-(\S+)/)?.[1]
  if (el && isShell.value) {
    decorateShell(el, {
      cwd: attrs.cwd as string | undefined,
      branch: attrs.branch as string | undefined,
      track: scope.track ?? deckTrack.value,
    })
  }
})

function snippet(): Snippet {
  const lines = Array.from(code()?.querySelectorAll(':scope > .line:not(.dd-shell-idle)') ?? [], lineText)
  return {
    ...focusOf(lines.join('\n'), startLine.value, ranges.value),
    lang: lang.value,
    // A shell session isn't the column's file.
    file: isShell.value ? undefined : scope.file,
    track: scope.track,
  }
}
</script>

<template>
  <div ref="root" class="dd-code-block group" :class="{ 'dd-shell': isShell }">
    <div
      ref="track"
      class="dd-code-track"
      :class="{ 'dd-code-track-animate': animate }"
      :style="{ transform: `translateY(${-offset}px)` }"
    >
      <Builtin v-bind="passthrough">
        <slot />
      </Builtin>
    </div>
    <SnippetCopy :snippet="snippet" />
    <SnippetPost :snippet="snippet" />
  </div>
</template>

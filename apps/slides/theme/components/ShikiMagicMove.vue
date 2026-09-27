<script setup lang="ts">
// Overrides Slidev's built-in ShikiMagicMove (a theme component with the
// same name wins). Same markdown (````md magic-move, one fenced block per
// step, click ranges per step), different animation: the built-in morphs
// word by word, which on a whole file reads as a blizzard of tokens. This
// moves whole lines instead. A line that survives into the next step keeps
// its identity (matched by a longest-common-subsequence diff) and slides to
// its new place; new lines fade in, removed lines fade out.
//
// Also, as CodeBlockWrapper.vue does for plain blocks: the editor viewport
// inside a code window (lib/viewport.ts), and copy + the Discord button,
// both taking the final step's focus (lib/snippets.ts).
import { computed, nextTick, onMounted, onUnmounted, ref, useAttrs, watch } from 'vue'
import lz from 'lz-string'
import { useNav } from '@slidev/client'
import { useSlideContext } from '@slidev/client'
import { CLICKS_MAX } from '@slidev/client/constants.ts'
import { makeId, updateCodeHighlightRange } from '@slidev/client/logic/utils.ts'
import SnippetCopy from './SnippetCopy.vue'
import SnippetPost from './SnippetPost.vue'
import { focusOf, useSnippetScope, type Snippet } from '../lib/snippets'
import { useCodeViewport } from '../lib/viewport'

defineOptions({ inheritAttrs: false })

interface Token { content: string, htmlStyle?: Record<string, string> | string, htmlClass?: string }
interface Step { code: string, lang?: string, lineNumbers?: boolean, tokens: Token[], rootStyle?: string }
interface Line { key: string, text: string, tokens: Token[] }

const attrs = useAttrs()
const scope = useSnippetScope()
const root = ref<HTMLElement>()
const track = ref<HTMLElement>()
const preEl = ref<HTMLElement>()
const { offset, animate } = useCodeViewport(root, track)
const { $clicksContext: clicks } = useSlideContext()
const { isPrintMode } = useNav()

// Slidev writes these kebab-case.
const steps = JSON.parse(lz.decompressFromBase64(String(attrs.stepsLz ?? attrs['steps-lz']))) as Step[]
const stepRanges = (attrs.stepRanges ?? attrs['step-ranges'] ?? []) as string[][]
const ranges = stepRanges.map(r => (r.length ? r : ['all']))
const at = (attrs.at ?? '+1') as string | number

function linesOf(step: Step): Omit<Line, 'key'>[] {
  const lines: Omit<Line, 'key'>[] = [{ text: '', tokens: [] }]
  for (const token of step.tokens) {
    if (token.htmlClass?.includes('shiki-magic-move-line-number')) continue
    if (token.content === '\n') {
      lines.push({ text: '', tokens: [] })
      continue
    }
    const line = lines[lines.length - 1]
    line.text += token.content
    line.tokens.push(token)
  }
  return lines
}

// Keys: a line keeps its key while it survives from step to step.
let nextKey = 0
const keyed: Line[][] = []
for (const step of steps) {
  const lines = linesOf(step)
  const prev = keyed.at(-1)
  const keys: (string | undefined)[] = Array.from({ length: lines.length })
  if (prev) {
    const n = prev.length
    const m = lines.length
    const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i][j] = prev[i].text === lines[j].text
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1])
      }
    }
    for (let i = 0, j = 0; i < n && j < m;) {
      if (prev[i].text === lines[j].text) keys[j++] = prev[i++].key
      else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++
      else j++
    }
  }
  keyed.push(lines.map((line, j) => ({ ...line, key: keys[j] ?? `l${nextKey++}` })))
}

const stepIndex = ref(0)
const rangeStr = ref('all')
const current = computed(() => keyed[stepIndex.value])
const showNumbers = computed(() => steps[stepIndex.value]?.lineNumbers ?? false)
const rootStyle = computed(() => steps[stepIndex.value]?.rootStyle)

function highlight() {
  const lines = Array.from(preEl.value?.querySelectorAll<HTMLElement>(':scope > code > .line:not(.dd-line-leave-active)') ?? [])
  updateCodeHighlightRange(rangeStr.value, lines.length, 1, no => (lines[no] ? [lines[no]] : []))
}

const id = makeId()
onUnmounted(() => clicks?.unregister(id))

onMounted(() => {
  if (!clicks) {
    stepIndex.value = steps.length - 1
    rangeStr.value = ranges.at(-1)?.at(-1) ?? 'all'
    nextTick(highlight)
    return
  }
  // The same click bookkeeping as the built-in: each step's ranges are its
  // clicks, one after another.
  const clickCounts = ranges.map(r => r.length).reduce((a, b) => a + b, 0)
  const info = clicks.calculateSince(at, clickCounts - 1)
  clicks.register(id, info)
  watch(
    () => clicks.current,
    () => {
      const count = info ? clicks.current - info.start : CLICKS_MAX
      let step = steps.length - 1
      let range = 'all'
      let sum = 0
      for (let i = 0; i < ranges.length; i++) {
        if (count < sum + ranges[i].length - 1) {
          step = i
          range = ranges[i][count - sum + 1]
          break
        }
        sum += ranges[i].length || 1
      }
      stepIndex.value = step
      rangeStr.value = range
      nextTick(highlight)
    },
    { immediate: true },
  )
})

function snippet(): Snippet {
  const last = steps.length - 1
  return {
    ...focusOf(steps[last].code, 1, stepRanges[last] ?? []),
    lang: steps[last].lang,
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
      <div class="slidev-code-wrapper">
        <pre ref="preEl" class="slidev-code shiki dd-lines" :style="rootStyle"><TransitionGroup
          :name="isPrintMode ? 'dd-line-none' : 'dd-line'"
          tag="code"
        ><span
          v-for="(line, i) in current"
          :key="line.key"
          class="line"
        ><span v-if="showNumbers" class="dd-ln">{{ i + 1 }}</span><span
          v-for="(token, t) in line.tokens"
          :key="t"
          :style="token.htmlStyle"
        >{{ token.content }}</span><span v-if="!line.tokens.length">&#8203;</span></span></TransitionGroup></pre>
      </div>
    </div>
    <SnippetCopy :snippet="snippet" />
    <SnippetPost :snippet="snippet" />
  </div>
</template>

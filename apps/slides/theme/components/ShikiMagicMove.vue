<script setup lang="ts">
// Overrides Slidev's built-in ShikiMagicMove (a theme component with the
// same name wins) for two things upstream lacks:
//
// 1. Real file line numbers. Upstream numbers every step from 1. Put the
//    step's first file line in the block's title slot instead:
//
//      ````md magic-move [@40] {lines: true}     every step starts at line 40
//      ````md magic-move [@40,@38] {lines: true} step 1 at 40, step 2 at 38
//
//    Highlight ranges on the steps are then file line numbers too, the same
//    as a plain block's `{lines:true,startLine:40}`. The title slot is the
//    only per-block text Slidev forwards, which is why it carries this.
// 2. The Discord post button (see lib/snippets.ts). It posts the final
//    step's focus.
//
// Everything else passes straight through to the built-in.
import { computed, useAttrs } from 'vue'
import lz from 'lz-string'
import Builtin from '@slidev/client/builtin/ShikiMagicMove.vue'
import SnippetPost from './SnippetPost.vue'
import { focusOf, useSnippetScope, type Snippet } from '../lib/snippets'

defineOptions({ inheritAttrs: false })

interface Token { key: string, content: string, htmlClass?: string }
interface Step { code: string, lang?: string, lineNumbers: boolean, tokens: Token[] }

const attrs = useAttrs()
const scope = useSnippetScope()

const title = computed(() => String(attrs.title ?? ''))
const starts = computed(() => {
  const m = title.value.match(/^@\d+(?:\s*,\s*@\d+)*$/)
  return m ? title.value.split(',').map(s => Number(s.trim().slice(1))) : undefined
})
const startOf = (i: number) => starts.value?.[i] ?? starts.value?.at(-1) ?? 1

const rawRanges = computed(() => (attrs.stepRanges ?? attrs['step-ranges'] ?? []) as string[][])
const steps = computed(() =>
  JSON.parse(lz.decompressFromBase64(String(attrs.stepsLz ?? attrs['steps-lz']))) as Step[])

const passthrough = computed(() => {
  if (!starts.value) return attrs

  const lastLine = Math.max(...steps.value.map((s, i) => startOf(i) + s.code.split('\n').length - 1))
  const digits = String(lastLine).length

  const renumbered = steps.value.map((step, i) => {
    let line = startOf(i)
    return {
      ...step,
      tokens: step.tokens.map((t) => {
        if (t.htmlClass !== 'shiki-magic-move-line-number') return t
        const n = line++
        // Keyed by the number itself, so a line number that exists in both
        // steps stays put while the code around it moves.
        return { ...t, key: `ln-${n}`, content: `${String(n).padStart(digits, ' ')}  ` }
      }),
    }
  })

  // The built-in highlights with the step's own 1-based lines.
  const shifted = rawRanges.value.map((ranges, i) =>
    ranges.map(r => r.replace(/\d+/g, n => String(Number(n) - startOf(i) + 1))))

  // Slidev writes these kebab-case; drop both spellings so ours are the
  // only ones the built-in sees.
  const { 'steps-lz': _a, 'step-ranges': _b, stepsLz: _c, stepRanges: _d, ...rest } = attrs
  return {
    ...rest,
    title: '',
    stepsLz: lz.compressToBase64(JSON.stringify(renumbered)),
    stepRanges: shifted,
  }
})

function snippet(): Snippet {
  const last = steps.value.length - 1
  const step = steps.value[last]
  return {
    ...focusOf(step.code, startOf(last), rawRanges.value[last] ?? []),
    lang: step.lang,
    file: scope.file,
    track: scope.track,
  }
}
</script>

<template>
  <div class="dd-code-block relative">
    <Builtin v-bind="passthrough" />
    <SnippetPost :snippet="snippet" />
  </div>
</template>

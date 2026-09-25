<script setup lang="ts">
// The default wash: the pptx template's corner glow (one radial gradient
// coming off the top-right corner, behind the chip), rebuilt in CSS so it
// doesn't band and can take a couple of companion blobs. Like the website's
// hero, the companions use complementary colours — here, other deck accents
// chosen per slide accent — and sit fainter than the main glow; the whole
// layer is blurred so none of them has an edge.
//
// Each blob is `[x%, y%, radiusX%, radiusY%, tint-strength]`, positioned in
// the blur layer's box (which overhangs the slide so the blur doesn't pull in
// dark edges).
import { computed } from 'vue'
import type { AccentName } from '../accents'
import { accentHex, DEFAULT_ACCENT } from '../accents'

const COMPANIONS: Record<AccentName, [AccentName, AccentName]> = {
  emerald: ['cyan', 'purple'],
  cyan: ['purple', 'emerald'],
  purple: ['cyan', 'red'],
  red: ['amber', 'purple'],
  amber: ['red', 'purple'],
  sky: ['purple', 'emerald'],
  rose: ['amber', 'purple'],
  indigo: ['sky', 'rose'],
}

type Blob = [cx: string, cy: string, rx: string, ry: string, strength: number]

const MAIN: Blob = ['84%', '12%', '56%', '76%', 30]
const FIRST: Blob = ['56%', '10%', '24%', '30%', 12]
const SECOND: Blob = ['92%', '56%', '22%', '30%', 12]

const props = withDefaults(defineProps<{ accent?: string }>(), { accent: undefined })

function gradient([cx, cy, rx, ry, strength]: Blob, color: string) {
  return `radial-gradient(${rx} ${ry} at ${cx} ${cy}, color-mix(in srgb, ${color} ${strength}%, transparent) 0%, transparent 70%)`
}

const backgroundImage = computed(() => {
  const name = (props.accent as AccentName) in COMPANIONS ? (props.accent as AccentName) : DEFAULT_ACCENT
  const [first, second] = COMPANIONS[name]
  return [
    gradient(FIRST, accentHex(first)),
    gradient(SECOND, accentHex(second)),
    gradient(MAIN, accentHex(name)),
  ].join(', ')
})
</script>

<template>
  <div class="dd-wash dd-wash-corner">
    <div class="dd-wash-corner-blobs" :style="{ backgroundImage }" />
  </div>
</template>

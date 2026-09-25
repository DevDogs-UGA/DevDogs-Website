<script setup lang="ts">
// The website's section wash (see apps/platform/src/ui/section-background.tsx
// and its callers like HeroSection/EventsSection), ported to a STATIC image —
// no parallax, no scroll listeners, no JS measuring. A slide never scrolls, so
// none of that machinery has anything to react to; five radial-gradient blobs
// baked into one CSS background, tinted to the slide's own accent, is the same
// picture standing still.
//
// Each blob below is `[x%, y%, radiusX%, radiusY%, tint-strength]`, copied from
// the site's HERO_BLOBS layout (position + size), with colour swapped for
// `color-mix(in srgb, var(--accent) N%, transparent)` so the wash always
// matches the slide's own accent instead of the site's fixed teal/crimson.
import { computed } from 'vue'

const BLOBS: [cx: string, cy: string, rx: string, ry: string, strength: number][] = [
  ['78%', '22%', '42%', '55%', 32],
  ['18%', '72%', '50%', '42%', 28],
  ['52%', '48%', '38%', '38%', 18],
  ['30%', '15%', '38%', '32%', 20],
  ['68%', '88%', '44%', '30%', 20],
]

const backgroundImage = computed(() =>
  BLOBS.map(
    ([cx, cy, rx, ry, strength]) =>
      `radial-gradient(${rx} ${ry} at ${cx} ${cy}, color-mix(in srgb, var(--accent) ${strength}%, transparent) 0%, transparent 70%)`,
  ).join(', '),
)
</script>

<template>
  <div class="dd-wash dd-wash-site" :style="{ backgroundImage }" />
</template>

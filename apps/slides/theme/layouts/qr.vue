<script setup lang="ts">
// Big centered QR + caption slide (attendance / Discord / exit).
// Frontmatter: accent, qrSrc (path under public/, e.g. "/qr/attendance.svg"),
// caption, label (small kicker above the code), chip, chrome, wash (see
// LAYOUTS.md)
//   ---
//   layout: qr
//   accent: cyan
//   qrSrc: /qr/attendance.svg
//   label: Attendance
//   caption: Scan to check in
//   ---
//
// NOTE: this frontmatter key is `qrSrc`, not `src` -- Slidev reserves plain
// `src` on a slide's frontmatter to mean "import this slide's content from
// another markdown file." A slide with `src: /qr/whatever.svg` gets silently
// treated as a (failed) markdown import and dropped from the deck instead of
// rendering -- see the git log for how this was found.
import { computed } from 'vue'
import { accentHex } from '../accents'
import QRSlot from '../components/QRSlot.vue'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'

const props = withDefaults(defineProps<{
  accent?: string
  qrSrc: string
  caption?: string
  label?: string
  chip?: string
  chrome?: boolean
  wash?: 'site' | 'template'
}>(), {
  accent: undefined,
  caption: undefined,
  label: undefined,
  chip: undefined,
  chrome: true,
  wash: undefined,
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))
</script>

<template>
  <div class="slidev-layout dd-qr relative overflow-hidden" :style="style">
    <Wash :accent="accent" :wash="wash" />
    <Chrome v-if="chrome" :accent="accent" :chip="chip" />
    <div class="dd-content h-full flex flex-col justify-center items-center text-center gap-6">
      <p v-if="label" class="text-lg font-600 uppercase tracking-widest" :style="{ color: 'var(--accent)' }">
        {{ label }}
      </p>
      <QRSlot :src="qrSrc" :caption="caption" :accent="accent" />
      <div class="max-w-2xl">
        <slot />
      </div>
    </div>
  </div>
</template>

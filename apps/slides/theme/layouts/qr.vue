<script setup lang="ts">
// Big centered QR + caption slide (attendance / Discord / exit).
// Frontmatter: accent, src (path under public/, e.g. "/qr/attendance.svg"),
// caption, label (small kicker above the code), chip, chrome, wash (see
// LAYOUTS.md)
//   ---
//   layout: qr
//   accent: cyan
//   src: /qr/attendance.svg
//   label: Attendance
//   caption: Scan to check in
//   ---
import { computed } from 'vue'
import { accentHex } from '../accents'
import QRSlot from '../components/QRSlot.vue'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'

const props = withDefaults(defineProps<{
  accent?: string
  src: string
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
      <QRSlot :src="src" :caption="caption" :accent="accent" />
      <div class="max-w-2xl">
        <slot />
      </div>
    </div>
  </div>
</template>

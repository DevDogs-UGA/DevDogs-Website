<script setup lang="ts">
// Big centered QR code + caption. Used directly, or via the `qr` layout
// (which wraps this with the accent corner wash + slide chrome).
// `src` is a path under public/, e.g. "/qr/attendance.svg".
import { computed } from 'vue'
import { accentHex } from '../accents'

const props = withDefaults(defineProps<{
  src: string
  caption?: string
  accent?: string
  // Small kicker label above the code (the `qr` layout renders its own
  // instead, at slide scale; this is for using QRSlot directly, e.g. two
  // side by side on the same slide).
  label?: string
  // QR image side length, any CSS length. Default matches the old fixed
  // h-56/w-56 (14rem = 224px).
  size?: string
  // Smaller padding + caption type, for fitting two side by side on a
  // single slide rather than one centered QRSlot filling the frame.
  compact?: boolean
  // Crops the image's own quiet zone (the blank margin QR generators put
  // around the modules), as a percentage of its width, e.g. "9.8%" for a
  // 4-module margin on a 33-module code (4/41). The frame's padding is
  // margin enough on a dark slide.
  trim?: string
  // No frame: the bare code on the slide, with a quiet grey label (the
  // closing slide's look).
  plain?: boolean
}>(), {
  caption: undefined,
  accent: undefined,
  label: undefined,
  size: '14rem',
  compact: false,
  trim: undefined,
  plain: false,
})

const ring = computed(() => accentHex(props.accent))
</script>

<template>
  <div class="flex flex-col items-center" :class="plain ? 'gap-2.5' : compact ? 'gap-2' : 'gap-4'">
    <p
      v-if="label"
      class="font-600 uppercase tracking-widest"
      :class="[compact || plain ? 'text-sm' : 'text-lg', { 'm-0 leading-none': plain }]"
      :style="plain ? { color: 'var(--dd-grey-secondary)', lineHeight: 1, margin: 0 } : { color: 'var(--accent)' }"
    >
      {{ label }}
    </p>
    <div
      :class="plain ? '' : ['rounded-2xl', compact ? 'p-2.5' : 'p-6']"
      :style="plain ? undefined : { background: 'var(--dd-panel)', boxShadow: `0 0 0 2px ${ring}` }"
    >
      <img :src="src" class="block" :style="{ height: size, width: size, objectViewBox: trim ? `inset(${trim})` : undefined }" alt="QR code" />
    </div>
    <div v-if="caption || $slots.default" class="text-center text-dd-muted" :class="compact ? 'text-sm max-w-[18rem]' : 'text-lg'">
      <slot>{{ caption }}</slot>
    </div>
  </div>
</template>

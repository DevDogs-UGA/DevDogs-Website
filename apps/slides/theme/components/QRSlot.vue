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
}>(), {
  caption: undefined,
  accent: undefined,
  label: undefined,
  size: '14rem',
  compact: false,
})

const ring = computed(() => accentHex(props.accent))
</script>

<template>
  <div class="flex flex-col items-center" :class="compact ? 'gap-2' : 'gap-4'">
    <p
      v-if="label"
      class="font-600 uppercase tracking-widest"
      :class="compact ? 'text-sm' : 'text-lg'"
      :style="{ color: 'var(--accent)' }"
    >
      {{ label }}
    </p>
    <div
      class="rounded-2xl"
      :class="compact ? 'p-3' : 'p-6'"
      :style="{ background: 'var(--dd-panel)', boxShadow: `0 0 0 2px ${ring}` }"
    >
      <img :src="src" :style="{ height: size, width: size }" alt="QR code" />
    </div>
    <div v-if="caption || $slots.default" class="text-center text-dd-muted" :class="compact ? 'text-sm max-w-[18rem]' : 'text-lg'">
      <slot>{{ caption }}</slot>
    </div>
  </div>
</template>

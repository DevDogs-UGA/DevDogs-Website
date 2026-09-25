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
}>(), {
  caption: undefined,
  accent: undefined,
})

const ring = computed(() => accentHex(props.accent))
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <div
      class="rounded-2xl p-6"
      :style="{ background: 'var(--dd-panel)', boxShadow: `0 0 0 2px ${ring}` }"
    >
      <img :src="src" class="h-56 w-56" alt="QR code" />
    </div>
    <div v-if="caption || $slots.default" class="text-center text-lg text-dd-muted">
      <slot>{{ caption }}</slot>
    </div>
  </div>
</template>

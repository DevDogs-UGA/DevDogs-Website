<script setup lang="ts">
// Event-type chip for the `events` layout (and anywhere else a labeled pill
// is useful). Maps known DevDogs event types to their site-legend accent;
// pass an explicit `color` to override.
import { computed } from 'vue'
import { accentHex } from '../accents'

const TYPE_ACCENT: Record<string, string> = {
  workshop: 'emerald',
  'dev session': 'cyan',
  social: 'purple',
  hackathon: 'amber',
  meeting: 'red',
}

const props = withDefaults(defineProps<{
  type?: string
  color?: string
  // 'outline' (default) is the low-emphasis pill used inline in prose, e.g.
  // on the `events` layout. 'solid' is the accent-filled, white-caps-text
  // pill used for every content slide's top-right corner chip (see the
  // `chip` frontmatter key and Chrome.vue).
  variant?: 'outline' | 'solid'
}>(), {
  type: undefined,
  color: undefined,
  variant: 'outline',
})

const hex = computed(() =>
  accentHex(props.color ?? (props.type ? TYPE_ACCENT[props.type.toLowerCase()] : undefined)),
)
</script>

<template>
  <span
    v-if="variant === 'solid'"
    class="inline-flex items-center rounded-full px-3 py-1 text-[0.65rem] font-700 uppercase tracking-wide text-white"
    :style="{ background: hex }"
  >
    <slot>{{ type }}</slot>
  </span>
  <span
    v-else
    class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-600 uppercase tracking-wide"
    :style="{ color: hex, borderColor: hex, background: `color-mix(in srgb, ${hex} 14%, transparent)`, border: '1px solid' }"
  >
    <slot>{{ type }}</slot>
  </span>
</template>

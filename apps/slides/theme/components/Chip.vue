<script setup lang="ts">
// Event-type chip for the `events` layout (and anywhere else a labeled pill
// is useful). Maps known DevDogs event types to their site-legend accent;
// pass an explicit `color` to override.
import { computed } from 'vue'
import { accentHex } from '../accents'

const TYPE_ACCENT: Record<string, string> = {
  workshop: 'emerald',
  'build session': 'cyan',
  social: 'purple',
  hackathon: 'amber',
  meeting: 'red',
}

const props = withDefaults(defineProps<{
  type?: string
  color?: string
  // 'outline' (default) is the low-emphasis pill used inline in prose, e.g.
  // on the `events` layout. 'solid' is the accent-filled, dark-caps-text
  // pill used for every content slide's top-right corner chip (see the
  // `chip` frontmatter key and Chrome.vue). Dark, not white: every accent
  // is a light 400-level colour, so white text on it measures 1.7-3.1:1,
  // while the slide background's near-black measures 6.3-11.5:1.
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
    class="dd-chip-solid inline-block rounded-full px-3 text-[0.65rem] font-700 uppercase tracking-wide"
    :style="{ background: hex, color: 'var(--dd-bg)' }"
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

<style scoped>
/* All caps, so the line box's room for descenders sat empty under the
   letters and pushed them high. Trimmed to the caps, the even padding
   centres them. (Trimming needs a block container, hence inline-block.) */
.dd-chip-solid {
  text-box: trim-both cap alphabetic;
  /* Hanken Grotesk's cap-height metric sits a hair above its drawn
     capitals, which left them slightly low; this evens the ink out. */
  padding-block: calc(0.5rem - 0.3px) calc(0.5rem + 0.3px);
}
</style>

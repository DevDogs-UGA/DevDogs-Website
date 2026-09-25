<script setup lang="ts">
// Wraps content that only belongs to one track, e.g.:
//   <Track web>This only shows on the web laptop.</Track>
//   <Track mobile>This only shows on the mobile laptop.</Track>
// Shows its slot when the track prop matches the current `?track=` value, OR
// when no track is set at all (so a plain, no-query-param view — like the
// PDF export — shows every track's content).
import { computed } from 'vue'
import { track, type TrackName } from '../lib/track'

const props = defineProps<{
  web?: boolean
  mobile?: boolean
}>()

const wants = computed<TrackName>(() => (props.mobile ? 'mobile' : 'web'))
const visible = computed(() => track.value === undefined || track.value === wants.value)
</script>

<template>
  <template v-if="visible">
    <slot />
  </template>
</template>

<script setup lang="ts">
// Wraps content that only belongs to one track, e.g.:
//   <Track web>This only shows on the web laptop.</Track>
//   <Track mobile>This only shows on the mobile laptop.</Track>
// Shows its slot when the track prop matches the current `?track=` value, OR
// when no track is set at all (so a plain, no-query-param view — like the
// PDF export — shows every track's content).
import { computed } from 'vue'
import { accentHex } from '../accents'
import { track, TRACK_ACCENT, type TrackName } from '../lib/track'
import { provideSnippetScope } from '../lib/snippets'

const props = defineProps<{
  web?: boolean
  mobile?: boolean
}>()

const wants = computed<TrackName>(() => (props.mobile ? 'mobile' : 'web'))
const visible = computed(() => track.value === undefined || track.value === wants.value)

// Code inside posts to this track's Discord channel only.
provideSnippetScope({ get track() { return wants.value } })
</script>

<template>
  <!-- display: contents keeps this wrapper out of layout; it only carries
       the stack's colour (TRACK_ACCENT) down to the code inside. -->
  <div v-if="visible" class="contents" :style="{ '--accent': accentHex(TRACK_ACCENT[wants]) }">
    <slot />
  </div>
</template>

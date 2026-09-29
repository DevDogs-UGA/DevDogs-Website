<script setup lang="ts">
// Live relay controls in the hosted presenter view's nav bar (lib/live.ts):
// how many demo laptops are following, and, on a slide with a `checkpoint`
// in its frontmatter, the button that switches their workshop clones to it.
//
//   ---
//   layout: dual-code
//   checkpoint: 02-supabase/03-insert-naive
//   ---
//
// A checkpoint throws away whatever was typed live on that laptop, so it
// takes two clicks: the button, then which laptop(s).
import { computed, ref, watch } from 'vue'
import { useNav } from '@slidev/client'
import type { Track } from './lib/discord'
import { CHECKPOINT_REF, checkpointStep } from './lib/liveProtocol'
import { attendees, checkpointResults, connection, currentRole, lastCheckpoint, peers, sendCheckpoint } from './lib/live'

const { currentFrontmatter, currentSlideNo } = useNav()

const driving = computed(() => currentRole.value === 'drive')
const checkpoint = computed(() => {
  const ref = currentFrontmatter.value?.checkpoint
  return typeof ref === 'string' && CHECKPOINT_REF.test(ref) ? ref : undefined
})

const armed = ref(false)
watch(currentSlideNo, () => (armed.value = false))

const peersLabel = computed(() => {
  if (connection.value !== 'open') return connection.value === 'connecting' ? 'Connecting to the relay…' : 'Relay disconnected, retrying'
  const { web, mobile } = peers.value
  return `Following: web ${web}, mobile ${mobile}`
})

// Attendees in VS Code ("23 in VS Code") and, on a checkpoint slide, how many
// of them are at that slide's step ("17/23 at Step 3"). Both tracks together;
// the tooltip splits them.
const attendance = computed(() => {
  const { web, mobile } = attendees.value
  const total = web.total + mobile.total
  const step = checkpoint.value ? checkpointStep(checkpoint.value) : undefined
  const at = (t: typeof web) => (step === undefined ? 0 : t.steps[step] ?? 0)
  return {
    total,
    step,
    at: at(web) + at(mobile),
    title: `In VS Code: web ${web.total}, mobile ${mobile.total}`
      + (step === undefined ? '' : `. At step ${step}: web ${at(web)}, mobile ${at(mobile)}`),
  }
})

const TRACKS: { label: string, tracks: Track[] }[] = [
  { label: 'Web', tracks: ['web'] },
  { label: 'Mobile', tracks: ['mobile'] },
  { label: 'Both', tracks: ['web', 'mobile'] },
]

function fire(tracks: Track[]) {
  if (!checkpoint.value) return
  sendCheckpoint(checkpoint.value, tracks)
  armed.value = false
}

// Each laptop's answer to the checkpoint just sent, if it's this slide's.
const results = computed(() => {
  const sent = lastCheckpoint.value
  if (!sent || sent.ref !== checkpoint.value) return []
  return sent.tracks.map(track => ({ track, status: checkpointResults.get(track) }))
})
</script>

<template>
  <template v-if="driving">
    <div class="dd-live" :title="peersLabel">
      <span class="dd-live-dot" :class="`dd-live-${connection}`" />
      <span v-if="connection === 'open'" class="text-xs opacity-70">{{ peers.web }}·{{ peers.mobile }}</span>
    </div>
    <template v-if="checkpoint">
      <button
        v-if="!armed"
        class="slidev-icon-btn"
        :title="`Switch the demo laptops to ${checkpoint} (discards what was typed)`"
        :disabled="connection !== 'open'"
        @click="armed = true"
      >
        <ph-flag-checkered />
      </button>
      <div v-else class="dd-live-arm">
        <span class="text-xs opacity-70">{{ checkpoint }} →</span>
        <button v-for="o in TRACKS" :key="o.label" class="dd-live-choice" @click="fire(o.tracks)">
          {{ o.label }}
        </button>
        <button class="slidev-icon-btn" title="Cancel" @click="armed = false">
          <ph-x />
        </button>
      </div>
      <span
        v-for="r in results"
        :key="r.track"
        class="dd-live-result"
        :title="r.status ? `${r.track}: ${r.status.message}` : `${r.track}: waiting…`"
      >
        <ph-circle-notch v-if="!r.status" class="animate-spin" />
        <ph-check-circle v-else-if="r.status.ok" class="text-accent-emerald" />
        <ph-warning-circle v-else class="text-accent-red" />
        <span class="text-xs">{{ r.track }}</span>
      </span>
    </template>
    <span v-if="connection === 'open'" class="dd-live-attend text-xs opacity-70" :title="attendance.title">
      {{ attendance.total }} in VS Code<template v-if="attendance.step !== undefined">
        · {{ attendance.at }}/{{ attendance.total }} at Step {{ attendance.step }}</template>
    </span>
  </template>
</template>

<style scoped>
.dd-live {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0 0.5rem;
}
.dd-live-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: #71717a;
}
.dd-live-open { background: #10b981; }
.dd-live-connecting { background: #f59e0b; }
.dd-live-closed { background: #ef4444; }
.dd-live-attend {
  padding: 0 0.25rem;
  white-space: nowrap;
}
.dd-live-arm {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.25rem;
}
.dd-live-choice {
  font-size: 0.75rem;
  padding: 0.1rem 0.5rem;
  border-radius: 0.25rem;
  border: 1px solid currentColor;
  opacity: 0.8;
}
.dd-live-choice:hover { opacity: 1; }
.dd-live-result {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0 0.25rem;
}
</style>

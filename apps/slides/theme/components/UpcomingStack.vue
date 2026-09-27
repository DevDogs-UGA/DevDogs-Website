<script setup lang="ts">
// The next few meetings as a short stack: the soonest at full size, each one
// after it scaled down a step, so the list recedes and the eye lands on the
// first. Scale, not opacity -- the later nights are still real dates
// somebody might plan around, just smaller.
//
// Ported from the platform homepage's
// `apps/platform/src/components/EventsSection/UpcomingMeetings.tsx`
// (`UpcomingStack`). That version fetches live from Postgres per request;
// this deck has no server, so the equivalent data arrives build-time from
// `@devdogsuga/events` via the `virtual:dd-meetings` Vite plugin
// (`theme/vite/meetings.ts`), already filtered to meetings after this
// workshop starts, cancelled/test rows dropped, sorted soonest-first.
import { computed } from 'vue'
import { meetings } from 'virtual:dd-meetings'
import NextMeetingStrip from './NextMeetingStrip.vue'

const UPCOMING_COUNT = 3
const STACK_STEP = ['', 'dd-stack-95', 'dd-stack-90'] as const
const STACK_EYEBROW = ['Next meeting', 'Then', 'After that'] as const

const props = withDefaults(defineProps<{ count?: number }>(), {
  count: UPCOMING_COUNT,
})

const shown = computed(() => meetings.slice(0, props.count))

// Each card takes a turn in the spotlight, on a loop, so the eye walks the
// whole list while the slide is up.
const EMPHASIS_SECONDS = 2.5
</script>

<template>
  <ol v-if="shown.length > 0" class="dd-upcoming-stack">
    <li
      v-for="(meeting, i) in shown"
      :key="meeting.id"
      :class="STACK_STEP[i] ?? STACK_STEP[STACK_STEP.length - 1]"
      :style="{ animationDelay: `${i * EMPHASIS_SECONDS}s`, animationDuration: `${shown.length * EMPHASIS_SECONDS}s` }"
    >
      <NextMeetingStrip
        :meeting="meeting"
        :eyebrow="STACK_EYEBROW[i] ?? STACK_EYEBROW[STACK_EYEBROW.length - 1]"
      />
    </li>
  </ol>
  <p v-else class="dd-upcoming-empty">
    Nothing on the calendar past tonight yet -- check devdogsuga.org/events.
  </p>
</template>

<style scoped>
.dd-upcoming-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  max-width: 40rem;
  margin: 0 auto;
  padding: 0;
  list-style: none;
}

.dd-upcoming-stack > li {
  width: 100%;
  transform-origin: top center;
  border-radius: 0.75rem;
  animation-name: dd-upcoming-spotlight;
  animation-iteration-count: infinite;
  animation-timing-function: ease-in-out;
}

/* `scale` composes with the stack's `transform: scale(...)` steps. The
   spotlight holds for a third of the cycle, one card at a time (each card's
   delay is its turn). */
@keyframes dd-upcoming-spotlight {
  0%, 36%, 100% {
    scale: 1;
    box-shadow: 0 0 0 0 transparent;
  }
  6%, 30% {
    scale: 1.05;
    box-shadow: 0 0.6rem 1.8rem -0.6rem color-mix(in srgb, var(--dd-ink) 25%, transparent);
  }
}

.dd-stack-95 {
  transform: scale(0.95);
}

.dd-stack-90 {
  transform: scale(0.9);
}

.dd-upcoming-empty {
  text-align: center;
  color: var(--dd-grey-support);
  font-size: 1.1rem;
}
</style>

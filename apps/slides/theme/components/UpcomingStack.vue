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
</script>

<template>
  <ol v-if="shown.length > 0" class="dd-upcoming-stack">
    <li
      v-for="(meeting, i) in shown"
      :key="meeting.id"
      :class="STACK_STEP[i] ?? STACK_STEP[STACK_STEP.length - 1]"
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

<script setup lang="ts">
// The next few meetings as a short stack, walked with the slide's clicks:
// the first is in the spotlight when the slide opens, and each click
// (the presenter's "next") moves it to the next one while the rest recede.
//
// Ported from the platform homepage's
// `apps/platform/src/components/EventsSection/UpcomingMeetings.tsx`
// (`UpcomingStack`). That version fetches live from Postgres per request;
// this deck has no server, so the equivalent data arrives build-time from
// `@devdogsuga/events` via the `virtual:dd-meetings` Vite plugin
// (`theme/vite/meetings.ts`), already filtered to meetings after this
// workshop starts, cancelled/test rows dropped, sorted soonest-first.
import { computed, onUnmounted } from 'vue'
import { useSlideContext } from '@slidev/client'
import { makeId } from '@slidev/client/logic/utils.ts'
import { meetings } from 'virtual:dd-meetings'
import NextMeetingStrip from './NextMeetingStrip.vue'

const UPCOMING_COUNT = 3
const STACK_EYEBROW = ['Next meeting', 'Then', 'After that'] as const

const props = withDefaults(defineProps<{ count?: number }>(), {
  count: UPCOMING_COUNT,
})

const shown = computed(() => meetings.slice(0, props.count))

// One click per card after the first.
const { $clicksContext: clicks } = useSlideContext()
const id = makeId()
const info = shown.value.length > 1 ? clicks?.calculateSince('+1', shown.value.length - 2) : undefined
if (clicks && info) clicks.register(id, info)
onUnmounted(() => clicks?.unregister(id))
const active = computed(() => {
  if (!clicks || !info) return 0
  return Math.max(0, Math.min(shown.value.length - 1, clicks.current - info.start + 1))
})
</script>

<template>
  <ol v-if="shown.length > 0" class="dd-upcoming-stack">
    <li
      v-for="(meeting, i) in shown"
      :key="meeting.id"
      :class="i === active ? 'dd-upcoming-active' : 'dd-upcoming-recessed'"
    >
      <NextMeetingStrip
        :meeting="meeting"
        :eyebrow="STACK_EYEBROW[i] ?? STACK_EYEBROW[STACK_EYEBROW.length - 1]"
      />
    </li>
  </ol>
  <p v-else class="dd-upcoming-empty">
    Nothing on the calendar past tonight yet: check devdogsuga.org/events.
  </p>
</template>

<style scoped>
.dd-upcoming-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  max-width: 40rem;
  margin: 0 auto;
  padding: 0;
  list-style: none;
}

.dd-upcoming-stack > li {
  width: 100%;
  border-radius: 0.75rem;
  transition: transform 0.45s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.45s ease, box-shadow 0.45s ease;
}

.dd-upcoming-active {
  transform: scale(1.03);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dd-ink) 18%, transparent), 0 0.8rem 2rem -0.8rem rgb(0 0 0 / 70%);
}

.dd-upcoming-recessed {
  transform: scale(0.94);
  opacity: 0.45;
}

.dd-upcoming-empty {
  text-align: center;
  color: var(--dd-grey-support);
  font-size: 1.1rem;
}
</style>

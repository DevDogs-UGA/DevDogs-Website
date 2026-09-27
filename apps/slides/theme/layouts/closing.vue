<script setup lang="ts">
// Exit / "before you go" slide — like `title` but meant for the last slide
// (thanks + where to go next). Pairs well with a `qr` slide right after it
// for attendance/Discord, or can carry its own QR codes directly via the
// `footer` slot (e.g. two side-by-side `<QRSlot compact>`s + a contact
// line) when there's no reason to spend a second slide on them.
// Frontmatter: accent, subtitle, chip, chrome, wash (see LAYOUTS.md)
// Slots: default (the big heading), `footer` (optional — rendered below
// the subtitle at normal scale, not the heading's giant size; use it for
// QR codes / contact info on the same slide)
//   ---
//   layout: closing
//   accent: cyan
//   subtitle: See you next week
//   ---
//   # Thanks for coming
//
//   ::footer::
//
//   <div class="dd-close-qr-row">
//     <QRSlot src="/qr/discord.svg" label="Discord" accent="rose" compact />
//     <QRSlot src="/qr/devdogsuga-org.svg" label="devdogsuga.org" accent="rose" compact />
//   </div>
import { computed } from 'vue'
import { accentHex } from '../accents'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'

const props = withDefaults(defineProps<{
  accent?: string
  subtitle?: string
  chip?: string
  chrome?: boolean
  wash?: 'corner' | 'site' | 'template'
}>(), {
  accent: undefined,
  subtitle: undefined,
  chip: undefined,
  chrome: true,
  wash: undefined,
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))
</script>

<template>
  <div class="slidev-layout dd-closing relative overflow-hidden" :style="style">
    <Wash :accent="accent" :wash="wash" />
    <Chrome v-if="chrome" :accent="accent" :chip="chip" />
    <div
      class="dd-content h-full flex flex-col items-center text-center"
      :class="$slots.footer ? 'dd-closing-full' : 'justify-center gap-5'"
    >
      <div class="dd-closing-head">
        <div :class="$slots.footer ? 'text-4xl' : 'text-6xl'">
          <slot />
        </div>
        <p v-if="subtitle" class="dd-closing-subtitle">
          {{ subtitle }}
        </p>
      </div>
      <div v-if="$slots.footer" class="dd-closing-footer">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.dd-closing-subtitle {
  margin: 0.3rem 0 0;
  font-size: 1.2rem;
  color: var(--dd-grey-secondary);
}

/* With a footer: the heading at the top, the contact lines at the bottom
   (the same distance from the slide's edge as the heading), and the QR
   codes centred in the space between. The footer's own wrapper steps aside
   (display: contents) so its QR row and contact lines are the column's
   items. */
.slidev-page .dd-closing:has(.dd-closing-full) {
  padding-bottom: var(--dd-safe-top);
}

.dd-closing-full {
  justify-content: space-between;
}

.dd-closing-full .dd-closing-footer {
  display: contents;
}

.dd-closing-full :deep(.dd-close-qr-row) {
  flex: 1;
  align-items: center !important;
}

.dd-closing-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.dd-closing-footer :deep(.dd-close-qr-row) {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 3rem;
}

/* Handles on one line (Instagram, GitHub, LinkedIn icons + the handle),
   email on the next, each led by its icons. */
.dd-closing-footer :deep(.dd-close-contact) {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
  color: var(--dd-grey-secondary);
  font-size: 1.05rem;
}

.dd-closing-footer :deep(.dd-close-contact p) {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
}

.dd-closing-footer :deep(.dd-close-contact svg) {
  color: var(--dd-ink);
  font-size: 1.15em;
}

.dd-closing-footer :deep(.dd-close-contact .dd-close-handle) {
  margin-left: 0.25rem;
}
</style>

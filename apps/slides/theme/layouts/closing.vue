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
    <div class="dd-content h-full flex flex-col justify-center items-center text-center gap-8">
      <div>
        <div class="text-6xl">
          <slot />
        </div>
        <p v-if="subtitle" class="mt-6 text-xl text-dd-muted">
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
.dd-closing-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
}

.dd-closing-footer :deep(.dd-close-qr-row) {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 3rem;
}

.dd-closing-footer :deep(.dd-close-contact) {
  margin: 0;
  color: var(--dd-grey-secondary);
  font-size: 1.05rem;
}
</style>

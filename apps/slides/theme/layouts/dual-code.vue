<script setup lang="ts">
// Two-column Next.js | Flutter code panel — the workhorse layout for the
// dual-track sections. Built on Slidev's named-slot convention (like the
// built-in two-cols theme layout), but with fixed, labeled columns instead
// of generic left/right. Each column gets the same faux-window titlebar as
// `terminal`, showing that column's file path.
//
// Track mode (see LAYOUTS.md and theme/lib/track.ts): when the deck's
// `?track=` is set, only the matching column shows, full width — the other
// laptop doesn't need Flutter code taking up half its screen, and vice
// versa. With no track set (e.g. the PDF export), both columns show, same
// as before.
//
// Frontmatter: accent, heading (optional heading rendered above both
// columns — use this instead of a markdown `#` so it doesn't get trapped
// inside the left slot), leftLabel (default "Next.js"), rightLabel
// (default "Flutter"), leftFile/rightFile (file path shown in each column's
// titlebar), trackSplit (default true — set `false` for a slide whose two
// columns aren't the web/mobile split, e.g. a before/after diff, so it
// doesn't lose a column whenever `?track=` happens to be set from an
// earlier live-demo slide in the same session), chip, chrome, wash (see
// LAYOUTS.md)
// Slots: default (left column, Next.js) and `right` (right column, Flutter)
//   ---
//   layout: dual-code
//   accent: emerald
//   heading: Sign in
//   leftFile: components/Guestbook.tsx
//   rightFile: lib/guestbook.dart
//   ---
//   ```ts
//   await supabase.auth.signInWithOAuth({ provider: 'custom:devdogs' })
//   ```
//
//   ::right::
//
//   ```dart
//   await supabase.auth.signInWithOAuth(...);
//   ```
//
// NOTE: this frontmatter key is `heading`, not `title` -- Slidev reserves
// plain `title` on a slide's frontmatter for its own slide-title metadata
// and never forwards it as a prop to the layout component, so a
// `title: ...` here silently renders nothing (same gotcha as the `qr`
// layout's `qrSrc` and the `terminal` layout's `titlebar` -- see those and
// the git log for how this was found).
import { computed } from 'vue'
import { accentHex } from '../accents'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'
import { track } from '../lib/track'

const props = withDefaults(defineProps<{
  accent?: string
  heading?: string
  leftLabel?: string
  rightLabel?: string
  leftFile?: string
  rightFile?: string
  trackSplit?: boolean
  chip?: string
  chrome?: boolean
  wash?: 'site' | 'template'
}>(), {
  accent: undefined,
  heading: undefined,
  leftLabel: 'Next.js',
  rightLabel: 'Flutter',
  leftFile: undefined,
  rightFile: undefined,
  trackSplit: true,
  chip: undefined,
  chrome: true,
  wash: undefined,
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))

// undefined = show both (no track chosen, or PDF export). Otherwise show
// only the matching column, full width. Slides with `trackSplit: false`
// (see NOTE above) always show both, regardless of `?track=`.
const showLeft = computed(() => !props.trackSplit || track.value !== 'mobile')
const showRight = computed(() => !props.trackSplit || track.value !== 'web')
</script>

<template>
  <div class="slidev-layout dd-dual-code relative overflow-hidden" :style="style">
    <Wash :accent="accent" :wash="wash" />
    <Chrome v-if="chrome" :accent="accent" :chip="chip" />
    <div class="dd-content dd-dual-code-content h-full flex flex-col">
      <h2 v-if="heading" class="dd-dual-code-heading">{{ heading }}</h2>
      <div
        class="grid gap-4 flex-1 min-h-0"
        :style="{ gridTemplateColumns: showLeft && showRight ? '1fr 1fr' : '1fr' }"
      >
        <div v-if="showLeft" class="dd-dual-code-window">
          <div class="dd-dual-code-titlebar">
            <span class="dd-dual-code-label">{{ leftLabel }}</span>
            <span v-if="leftFile" class="dd-dual-code-file">{{ leftFile }}</span>
          </div>
          <div class="dd-dual-code-body">
            <slot />
          </div>
        </div>
        <div v-if="showRight" class="dd-dual-code-window dd-dual-code-window-right">
          <div class="dd-dual-code-titlebar">
            <span class="dd-dual-code-label">{{ rightLabel }}</span>
            <span v-if="rightFile" class="dd-dual-code-file">{{ rightFile }}</span>
          </div>
          <div class="dd-dual-code-body">
            <slot name="right" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dd-dual-code-content {
  /* Unlike every other layout (which centers its content vertically, so
     it naturally clears the top-left DevDogs mark), this one stretches
     its two windows full-height from the very top of the slide -- without
     this padding the left window's titlebar renders right underneath the
     mark and the two overlap. */
  padding-top: 4rem;
}

.dd-dual-code-heading {
  margin-bottom: 1rem;
}

.dd-dual-code-window {
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-radius: 0.75rem;
  overflow: hidden;
  background: var(--dd-panel);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent);
}

.dd-dual-code-window-right {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dd-muted) 40%, transparent);
}

.dd-dual-code-titlebar {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  padding: 0.6rem 0.9rem;
  background: #0000002e;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
}

.dd-dual-code-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--accent);
}

.dd-dual-code-file {
  font-family: 'Cascadia Code', monospace;
  font-size: 0.75rem;
  color: var(--dd-grey-dim);
}

.dd-dual-code-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.75rem 1rem;
  /* Same reasoning as terminal.vue: let the code fill the window instead of
     drawing its own box inside it. */
  --slidev-code-background: transparent;
  --slidev-code-padding: 0;
  --slidev-code-radius: 0;
}

.dd-dual-code-body :deep(pre) {
  margin: 0;
  background: transparent !important;
  font-size: 0.85rem;
}
</style>

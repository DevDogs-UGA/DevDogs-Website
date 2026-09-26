<script setup lang="ts">
// Two-column Next.js | Flutter code panel — the workhorse layout for the
// dual-track sections. Built on Slidev's named-slot convention (like the
// built-in two-cols theme layout), but with fixed, labeled columns instead
// of generic left/right. Each column is the same code window as `terminal`
// (see base.css "Code windows"), titled with its stack and file path.
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
// Slots: default (left column, Next.js), `right` (right column, Flutter),
// and `bottom` (optional -- a full-width callout rendered below both
// columns, e.g. a caveat that applies to the whole slide rather than one
// column. Omit it and nothing renders; no empty bar).
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
//   ::bottom::
//
//   > Conflict in `pnpm-lock.yaml`? Don't edit it by hand -- run `pnpm install`
//   > and commit the result.
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
import SnippetScope from '../components/SnippetScope.vue'
import { track, TRACK_ACCENT } from '../lib/track'

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
  wash?: 'corner' | 'site' | 'template'
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

// On a web/mobile split each column wears its stack's colour (TRACK_ACCENT),
// and with a track chosen the whole slide (chip, wash) follows that column.
// With both columns showing, the chip and wash keep the slide's `accent`.
const slideAccent = computed(() =>
  props.trackSplit && track.value ? TRACK_ACCENT[track.value] : props.accent)
const style = computed(() => ({ '--accent': accentHex(slideAccent.value) }))
const leftStyle = computed(() => props.trackSplit ? { '--accent': accentHex(TRACK_ACCENT.web) } : {})
const rightStyle = computed(() => props.trackSplit ? { '--accent': accentHex(TRACK_ACCENT.mobile) } : {})

// undefined = show both (no track chosen, or PDF export). Otherwise show
// only the matching column, full width. Slides with `trackSplit: false`
// (see NOTE above) always show both, regardless of `?track=`.
const showLeft = computed(() => !props.trackSplit || track.value !== 'mobile')
const showRight = computed(() => !props.trackSplit || track.value !== 'web')
</script>

<template>
  <div class="slidev-layout dd-dual-code relative overflow-hidden" :style="style">
    <Wash :accent="slideAccent" :wash="wash" />
    <Chrome v-if="chrome" :accent="slideAccent" :chip="chip" />
    <div class="dd-content h-full flex flex-col">
      <h2 v-if="heading" class="dd-window-heading">{{ heading }}</h2>
      <div
        class="grid gap-4 flex-1 min-h-0"
        :style="{ gridTemplateColumns: showLeft && showRight ? '1fr 1fr' : '1fr' }"
      >
        <div v-if="showLeft" class="dd-window" :style="leftStyle">
          <div class="dd-window-titlebar">
            <span class="dd-window-label">{{ leftLabel }}</span>
            <span v-if="leftFile" class="dd-window-file">{{ leftFile }}</span>
          </div>
          <div class="dd-window-body dd-code-frame">
            <SnippetScope :track="trackSplit ? 'web' : undefined" :file="leftFile">
              <slot />
            </SnippetScope>
          </div>
        </div>
        <div
          v-if="showRight"
          class="dd-window"
          :class="{ 'dd-dual-code-window-right': !trackSplit }"
          :style="rightStyle"
        >
          <div class="dd-window-titlebar">
            <span class="dd-window-label">{{ rightLabel }}</span>
            <span v-if="rightFile" class="dd-window-file">{{ rightFile }}</span>
          </div>
          <div class="dd-window-body dd-code-frame">
            <SnippetScope :track="trackSplit ? 'mobile' : undefined" :file="rightFile">
              <slot name="right" />
            </SnippetScope>
          </div>
        </div>
      </div>
      <div v-if="$slots.bottom" class="dd-dual-code-bottom">
        <slot name="bottom" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.dd-dual-code-bottom {
  flex-shrink: 0;
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  background: var(--dd-card-fill);
  border: 1px solid var(--dd-hairline);
  font-size: 0.95rem;
  color: var(--dd-grey-support);
}

.dd-dual-code-bottom :deep(p),
.dd-dual-code-bottom :deep(blockquote) {
  margin: 0;
}

.dd-dual-code-bottom :deep(blockquote) {
  padding: 0;
  border: none;
  color: inherit;
}

.dd-dual-code-window-right {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dd-muted) 40%, transparent);
}

/* A column can also hold prose (the conflict slide's screenshot and
   caption), which should sit at its natural size. */
.dd-code-frame :deep(p) {
  flex: none;
  margin: 0.5rem 0 0;
}
</style>

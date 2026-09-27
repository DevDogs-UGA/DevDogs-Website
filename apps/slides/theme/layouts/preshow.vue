<script setup lang="ts">
// Pre-show slide, shown before the talk starts while people are finding
// seats. Also carries what used to be the deck's separate title slide (the
// event name + date/time/room + the WORKSHOP chip), in a header band above
// the split — see LAYOUTS.md.
//
// Points each laptop at where its own half of the room is, using track mode
// (see LAYOUTS.md and theme/lib/track.ts):
//   - ?track=web    → only the web (purple / DogDays) half, full width
//   - ?track=mobile → only the mobile (sky / DogPack) half, full width
//   - no track set  → both halves side by side (so the PDF export and a
//     shared/no-param view show the whole room layout)
// Frontmatter: accent, logo (an image above the heading, e.g. the topic's
// wordmark) + logoAlt, subtitle, chip, chrome, wash (see LAYOUTS.md)
import { computed } from 'vue'
import { accentHex } from '../accents'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'
import DogDaysMark from '../components/DogDaysMark.vue'
import DogPackMark from '../components/DogPackMark.vue'
import { track } from '../lib/track'

const props = withDefaults(defineProps<{
  accent?: string
  logo?: string
  logoAlt?: string
  subtitle?: string
  chip?: string
  chrome?: boolean
  wash?: 'corner' | 'site' | 'template'
}>(), {
  accent: undefined,
  logo: undefined,
  logoAlt: '',
  subtitle: undefined,
  chip: undefined,
  chrome: true,
  wash: undefined,
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))

const showWeb = computed(() => track.value !== 'mobile')
const showMobile = computed(() => track.value !== 'web')
const showBoth = computed(() => showWeb.value && showMobile.value)
const splitColumns = computed(() => (showBoth.value ? '1fr 1fr' : '1fr'))
</script>

<template>
  <div class="slidev-layout dd-preshow relative overflow-hidden" :style="style">
    <Wash :accent="accent" :wash="wash" />
    <Chrome v-if="chrome" :accent="accent" :chip="chip" />
    <div class="dd-content h-full flex flex-col">
      <div class="dd-preshow-header">
        <img v-if="logo" :src="logo" :alt="logoAlt" class="dd-preshow-logo">
        <slot />
        <p v-if="subtitle" class="dd-preshow-eventline">
          {{ subtitle }}
        </p>
      </div>
      <div
        class="dd-preshow-split flex-1"
        :class="{ 'dd-preshow-both': showBoth }"
        :style="{ gridTemplateColumns: splitColumns }"
      >
        <div v-if="showWeb" class="dd-preshow-half dd-preshow-half-web">
          <div class="dd-preshow-half-wash" />
          <p class="dd-preshow-sub">
            Designed for <span class="dd-preshow-name dd-preshow-dogdays"><DogDaysMark class="dd-preshow-mark" /><span class="dd-preshow-brand">DogDays</span></span> contributors<br>
            and future web developers
          </p>
          <svg class="dd-preshow-arrow" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3.5v16M5 12.5l7 7 7-7" />
          </svg>
          <p class="dd-preshow-line">
            Working on web apps?<br>
            Sit on this side!
          </p>
        </div>
        <div v-if="showMobile" class="dd-preshow-half dd-preshow-half-mobile">
          <div class="dd-preshow-half-wash" />
          <p class="dd-preshow-sub">
            Designed for <span class="dd-preshow-name dd-preshow-dogpack"><DogPackMark class="dd-preshow-mark" /><span class="dd-preshow-brand">DogPack</span></span> contributors<br>
            and future mobile developers
          </p>
          <svg class="dd-preshow-arrow" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3.5v16M5 12.5l7 7 7-7" />
          </svg>
          <p class="dd-preshow-line">
            Working on mobile apps?<br>
            Sit on this side!
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dd-preshow-header {
  text-align: center;
  flex: none;
}

.dd-preshow-logo {
  display: block;
  height: 2.6rem;
  width: auto;
  margin: 0 auto;
}

.dd-preshow-header :deep(h1) {
  font-size: 2.75rem;
  line-height: 1.1;
  margin: 0;
}

/* Under a logo, the heading is its subtitle. */
.dd-preshow-logo + :deep(h1) {
  margin-top: 0.6rem;
  font-size: 1.75rem;
}

.dd-preshow-eventline {
  margin: 0.4rem 0 0;
  font-size: 1.05rem;
  color: var(--dd-grey-secondary);
}

.dd-preshow-split {
  position: relative;
  display: grid;
  align-items: center;
  min-height: 0;
}

/* A soft hairline between the two halves, only meaningful once both render. */
.dd-preshow-split.dd-preshow-both::after {
  content: '';
  position: absolute;
  top: 6%;
  bottom: 6%;
  left: 50%;
  width: 1px;
  background: linear-gradient(
    to bottom,
    transparent,
    var(--dd-hairline) 15%,
    var(--dd-hairline) 85%,
    transparent
  );
}

.dd-preshow-half {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 1.5rem 2.5rem;
  text-align: center;
}

/* Each half gets its own colored wash: a blurred radial glow tinted in
   that half's accent, so the split reads as two deliberately lit zones
   instead of two plain columns. */
.dd-preshow-half-wash {
  position: absolute;
  inset: -3rem;
  z-index: -1;
  filter: blur(48px);
  pointer-events: none;
}

.dd-preshow-half-web .dd-preshow-half-wash {
  background: radial-gradient(
    55% 65% at 50% 35%,
    color-mix(in srgb, var(--dd-purple) 30%, transparent) 0%,
    transparent 72%
  );
}

.dd-preshow-half-mobile .dd-preshow-half-wash {
  background: radial-gradient(
    55% 65% at 50% 35%,
    color-mix(in srgb, var(--dd-sky) 30%, transparent) 0%,
    transparent 72%
  );
}

.dd-preshow-line {
  font-family: 'Alan Sans', 'Hanken Grotesk', sans-serif;
  font-weight: 800;
  font-size: 2.1rem;
  line-height: 1.2;
  margin: 0;
  white-space: nowrap;
}

.dd-preshow-half-web .dd-preshow-line {
  color: var(--dd-purple);
}

.dd-preshow-half-mobile .dd-preshow-line {
  color: var(--dd-sky);
}

@keyframes dd-preshow-nudge {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(0.45rem);
  }
}

/* Drawn rather than an icon font: even Phosphor's bold arrow is a hairline
   next to the extra-bold line below it. At 1em of that line's size, a
   3.6-unit stroke is its own ~0.15em stem, with round ends
   like Alan Sans's terminals. It nudges down, over and over. */
.dd-preshow-arrow {
  width: 2.1rem;
  height: 2.1rem;
  animation: dd-preshow-nudge 1.6s ease-in-out infinite;
  fill: none;
  stroke: currentColor;
  stroke-width: 3.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dd-preshow-half-web .dd-preshow-arrow {
  color: var(--dd-purple);
}

.dd-preshow-half-mobile .dd-preshow-arrow {
  color: var(--dd-sky);
}

.dd-preshow-sub {
  /* The extra space sits between the subtitle and the arrow. */
  margin: 0 0 0.9rem;
  font-size: 1.15rem;
  font-style: italic;
  /* A step lighter than --dd-grey-secondary. */
  color: #e6e1e6;
}

.dd-preshow-name {
  /* A name, not part of the italic sentence around it (and Alan Sans has
     no italic, so it would only be slanted). */
  font-style: normal;
  display: inline-flex;
  align-items: baseline;
  white-space: nowrap;
}

/* The space before the mark is the text's own; the gap after it keeps the
   icon from touching the name. */
.dd-preshow-mark {
  margin-right: 0.2em;
}

.dd-preshow-brand {
  font-family: 'Alan Sans', 'Hanken Grotesk', sans-serif;
  /* Bold, as the platform's project cards set these names. */
  font-weight: 700;
}

/* The projects' own colours from the platform (red-700 / purple-700 there,
   on white), a step lighter here for the dark slide. */
.dd-preshow-dogdays {
  color: var(--dd-red);
}

.dd-preshow-dogpack {
  color: var(--dd-purple);
}
</style>

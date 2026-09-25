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
// Frontmatter: accent, subtitle, chip, chrome, wash (see LAYOUTS.md)
import { computed } from 'vue'
import { accentHex } from '../accents'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'
import DogDaysMark from '../components/DogDaysMark.vue'
import DogPackMark from '../components/DogPackMark.vue'
import { track } from '../lib/track'

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
          <p class="dd-preshow-line">
            Working on web apps? Sit here
          </p>
          <ph-arrow-down-bold class="dd-preshow-arrow" />
          <p class="dd-preshow-sub">
            Designed for <span class="dd-preshow-name"><DogDaysMark class="dd-preshow-mark" /><span class="dd-preshow-brand">DogDays</span></span> contributors
          </p>
        </div>
        <div v-if="showMobile" class="dd-preshow-half dd-preshow-half-mobile">
          <div class="dd-preshow-half-wash" />
          <p class="dd-preshow-line">
            Working on mobile apps? Sit here
          </p>
          <ph-arrow-down-bold class="dd-preshow-arrow" />
          <p class="dd-preshow-sub">
            Designed for <span class="dd-preshow-name"><DogPackMark class="dd-preshow-mark" /><span class="dd-preshow-brand">DogPack</span></span> contributors
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

.dd-preshow-header :deep(h1) {
  font-size: 2.75rem;
  line-height: 1.1;
  margin: 0;
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
  font-size: 2.35rem;
  line-height: 1.2;
  margin: 0;
  max-width: 18ch;
}

.dd-preshow-half-web .dd-preshow-line {
  color: var(--dd-purple);
}

.dd-preshow-half-mobile .dd-preshow-line {
  color: var(--dd-sky);
}

.dd-preshow-arrow {
  font-size: 2rem;
}

.dd-preshow-half-web .dd-preshow-arrow {
  color: var(--dd-purple);
}

.dd-preshow-half-mobile .dd-preshow-arrow {
  color: var(--dd-sky);
}

.dd-preshow-sub {
  margin: 0;
  font-size: 1.15rem;
  color: var(--dd-grey-secondary);
}

.dd-preshow-name {
  display: inline-flex;
  align-items: baseline;
  white-space: nowrap;
}

.dd-preshow-mark {
  margin-left: 0.35em;
  margin-right: 0.05em;
}

.dd-preshow-brand {
  font-family: 'Alan Sans', 'Hanken Grotesk', sans-serif;
  font-weight: 800;
}

.dd-preshow-half-web .dd-preshow-mark,
.dd-preshow-half-web .dd-preshow-brand {
  color: var(--dd-purple);
}

.dd-preshow-half-mobile .dd-preshow-mark,
.dd-preshow-half-mobile .dd-preshow-brand {
  color: var(--dd-sky);
}
</style>

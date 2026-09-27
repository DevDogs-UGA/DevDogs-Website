<script setup lang="ts">
// One code window that makes room for a second: the first fills the width,
// and on a click the second slides in beside it (e.g. the terminal that
// created the migration files, then the files themselves in an editor).
// Both are the standard code windows (base.css "Code windows").
//
// The reveal is this slide's first click, registered before the code
// inside either window registers its own, so a block's ranges start once
// it's on screen.
//
// Frontmatter: accent, heading, firstLabel / firstFile, secondLabel /
// secondFile (files may differ by track, see lib/track.ts `PerTrack`),
// followTrack (the accent follows `?track=`), chip, chrome, wash
// Slots: default (the first window), `second`
//   ---
//   layout: split-reveal
//   heading: Turn the SQL into Migrations
//   firstLabel: Terminal
//   secondLabel: Editor
//   secondFile: ~/supabase/migrations/20260928000000_guestbook.sql
//   ---
//   ```bash
//   pnpm dlx supabase migration new guestbook
//   ```
//
//   ::second::
//
//   <<< web:supabase/migrations/20260928000000_guestbook.sql {7-13|15}
import { computed, onUnmounted } from 'vue'
import { useSlideContext } from '@slidev/client/context'
import { makeId } from '@slidev/client/logic/utils'
import { accentHex } from '../accents'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'
import SnippetScope from '../components/SnippetScope.vue'
import ArrowText from '../components/ArrowText.vue'
import { forTrack, track, TRACK_ACCENT, type PerTrack } from '../lib/track'

const props = withDefaults(defineProps<{
  accent?: string
  heading?: string
  firstLabel?: string
  firstFile?: PerTrack
  secondLabel?: string
  secondFile?: PerTrack
  followTrack?: boolean
  chip?: string
  chrome?: boolean
  wash?: 'corner' | 'site' | 'template'
}>(), {
  accent: undefined,
  heading: undefined,
  firstLabel: 'Terminal',
  firstFile: undefined,
  secondLabel: 'Editor',
  secondFile: undefined,
  followTrack: false,
  chip: undefined,
  chrome: true,
  wash: undefined,
})

const slideAccent = computed(() =>
  props.followTrack && track.value ? TRACK_ACCENT[track.value] : props.accent)
const style = computed(() => ({ '--accent': accentHex(slideAccent.value) }))
const firstFileText = computed(() => forTrack(props.firstFile))
const secondFileText = computed(() => forTrack(props.secondFile))

// Registered during setup, i.e. before any code block inside (they
// register when mounted), so the reveal is click 1.
const { $clicksContext: clicks } = useSlideContext()
const id = makeId()
const info = clicks?.calculateSince('+1', 0)
if (clicks && info) clicks.register(id, info)
onUnmounted(() => clicks?.unregister(id))
const open = computed(() => !clicks || !info || clicks.current >= info.start)
</script>

<template>
  <div class="slidev-layout dd-split-reveal relative overflow-hidden" :style="style">
    <Wash :accent="slideAccent" :wash="wash" />
    <Chrome v-if="chrome" :accent="slideAccent" :chip="chip" />
    <div class="dd-content h-full flex flex-col">
      <h2 v-if="heading" class="dd-window-heading">{{ heading }}</h2>
      <div class="dd-split flex-1 min-h-0" :class="{ 'dd-split-open': open }">
        <div class="dd-window">
          <div class="dd-window-titlebar">
            <span class="dd-window-label"><ArrowText :text="firstLabel" /></span>
            <span v-if="firstFileText" class="dd-window-file">{{ firstFileText }}</span>
          </div>
          <div class="dd-window-body dd-code-frame">
            <SnippetScope :file="firstFileText">
              <slot />
            </SnippetScope>
          </div>
        </div>
        <div class="dd-window dd-split-second">
          <div class="dd-window-titlebar">
            <span class="dd-window-label"><ArrowText :text="secondLabel" /></span>
            <span v-if="secondFileText" class="dd-window-file">{{ secondFileText }}</span>
          </div>
          <div class="dd-window-body dd-code-frame">
            <SnippetScope :file="secondFileText">
              <slot name="second" />
            </SnippetScope>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dd-split {
  display: grid;
  grid-template-columns: 1fr 0fr;
  column-gap: 0;
  transition: grid-template-columns 0.6s cubic-bezier(0.4, 0, 0.2, 1), column-gap 0.6s ease;
}

.dd-split-open {
  grid-template-columns: 1fr 1fr;
  column-gap: 1rem;
}

.dd-split-second {
  opacity: 0;
  transition: opacity 0.35s ease;
}

.dd-split-open .dd-split-second {
  opacity: 1;
  transition-delay: 0.3s;
}
</style>

<script setup lang="ts">
// Bullets on the left, a full-height code window on the right: the standard
// code window (base.css "Code windows"), so a file shown here looks like it
// does on every other code slide. For "do this, and here's the file" slides
// (e.g. project setup, with the env file).
// Frontmatter: accent, heading (the slide's title, above both sides),
// label (the window's label, default "Editor"), file (may differ by track,
// see lib/track.ts `PerTrack`), followTrack (the accent follows `?track=`),
// chip, chrome, wash (see LAYOUTS.md)
// Slots: default (the bullets), `code` (the window's content)
//   ---
//   layout: bullets-code
//   heading: Project Setup
//   file: { web: ~/.env.local, mobile: ~/.env.local }
//   ---
//   - Create a Supabase project
//
//   ::code::
//
//   <Track web>
//
//   <<< web:.env.example
//
//   </Track>
import { computed } from 'vue'
import { accentHex } from '../accents'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'
import SnippetScope from '../components/SnippetScope.vue'
import WindowTitle from '../components/WindowTitle.vue'
import { forTrack, track, TRACK_ACCENT, type PerTrack } from '../lib/track'

const props = withDefaults(defineProps<{
  accent?: string
  heading?: string
  label?: string
  file?: PerTrack
  followTrack?: boolean
  chip?: string
  chrome?: boolean
  wash?: 'corner' | 'site' | 'template'
}>(), {
  accent: undefined,
  heading: undefined,
  label: 'Editor',
  file: undefined,
  followTrack: false,
  chip: undefined,
  chrome: true,
  wash: undefined,
})

const slideAccent = computed(() =>
  props.followTrack && track.value ? TRACK_ACCENT[track.value] : props.accent)
const style = computed(() => ({ '--accent': accentHex(slideAccent.value) }))
const fileText = computed(() => forTrack(props.file))
</script>

<template>
  <div class="slidev-layout dd-bullets-code relative overflow-hidden" :style="style">
    <Wash :accent="slideAccent" :wash="wash" />
    <Chrome v-if="chrome" :accent="slideAccent" :chip="chip" />
    <div class="dd-content h-full flex flex-col">
      <h2 v-if="heading" class="dd-window-heading">{{ heading }}</h2>
      <div class="dd-bullets-code-grid flex-1 min-h-0">
        <div class="dd-bullets self-center">
          <slot />
        </div>
        <div class="dd-window">
          <div class="dd-window-titlebar">
            <WindowTitle :label="label" :file="fileText" />
          </div>
          <div class="dd-window-body dd-code-frame">
            <SnippetScope :file="fileText">
              <slot name="code" />
            </SnippetScope>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The window gets the wider share: a file's lines need the room. */
.dd-bullets-code-grid {
  display: grid;
  grid-template-columns: 5fr 7fr;
  gap: 2rem;
}

.dd-bullets :deep(ul) {
  list-style: none;
  padding-left: 0;
}

.dd-bullets :deep(li) {
  position: relative;
  margin: 0.6em 0;
  padding-left: 1.25em;
  font-size: 1.2rem;
  text-wrap: balance;
}

.dd-bullets :deep(li)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.5em;
  width: 0.5em;
  height: 0.5em;
  border-radius: 999px;
  background: var(--accent);
}
</style>

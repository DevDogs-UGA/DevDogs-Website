<script setup lang="ts">
// One code window, full width: a shell session, or SQL for the Dashboard's
// SQL editor. The same window, in the same place, as a dual-code column
// (see base.css "Code windows"), so code slides don't jump around.
// The titlebar shows `titlebar` as its label (default "shell") and `file`
// beside it when given; `file` is also the path a Discord post names.
// Frontmatter: accent, heading, titlebar, file, chip, chrome, wash (see
// LAYOUTS.md)
//   ---
//   layout: terminal
//   accent: emerald
//   heading: Create the messages table
//   titlebar: Dashboard → SQL editor
//   file: supabase/migrations/20260928000000_guestbook.sql
//   ---
//   <<< web@step-1:supabase/migrations/20260928000000_guestbook.sql {7-22}
//
// NOTE: this frontmatter key is `titlebar`, not `title` -- Slidev reserves
// plain `title` on a slide's frontmatter for its own slide-title metadata
// (table of contents, browser tab, etc.) and never forwards it as a prop to
// the layout component, so a `title: ...` here would silently render as the
// "shell" default instead. Same class of gotcha as the `qr` layout's
// `qrSrc` (see that layout and the git log for how this was found).
import { computed, useId } from 'vue'
import { accentHex } from '../accents'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'
import SnippetScope from '../components/SnippetScope.vue'
import WindowTitle from '../components/WindowTitle.vue'
import { forTrack, track, TRACK_ACCENT, type PerTrack } from '../lib/track'

const props = withDefaults(defineProps<{
  accent?: string
  heading?: string
  file?: PerTrack
  titlebar?: string
  followTrack?: boolean
  chip?: string
  chrome?: boolean
  wash?: 'corner' | 'site' | 'template'
}>(), {
  accent: undefined,
  heading: undefined,
  file: undefined,
  titlebar: 'shell',
  followTrack: false,
  chip: undefined,
  chrome: true,
  wash: undefined,
})

// `followTrack`: the accent follows `?track=` (a slide whose code differs
// by track, wrapped in <Track>). `file` may differ by track too.
const slideAccent = computed(() =>
  props.followTrack && track.value ? TRACK_ACCENT[track.value] : props.accent)
const style = computed(() => ({ '--accent': accentHex(slideAccent.value) }))
const fileText = computed(() => forTrack(props.file))

// A <CodeTips> banner goes in the slot under the window, not in it.
const tips = `dd-tips-${useId()}`
</script>

<template>
  <div class="slidev-layout dd-terminal relative overflow-hidden" :style="style">
    <Wash :accent="slideAccent" :wash="wash" />
    <Chrome v-if="chrome" :accent="slideAccent" :chip="chip" />
    <div class="dd-content h-full flex flex-col">
      <h2 v-if="heading" class="dd-window-heading">{{ heading }}</h2>
      <div class="dd-window flex-1">
        <div class="dd-window-titlebar">
          <WindowTitle :label="titlebar" :file="fileText" />
        </div>
        <div class="dd-window-body dd-code-frame">
          <SnippetScope :file="fileText" :tips="tips">
            <slot />
          </SnippetScope>
        </div>
      </div>
      <div :id="tips" class="dd-tips-slot" />
    </div>
  </div>
</template>

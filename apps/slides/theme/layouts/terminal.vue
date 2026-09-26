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
import { computed } from 'vue'
import { accentHex } from '../accents'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'
import SnippetScope from '../components/SnippetScope.vue'

const props = withDefaults(defineProps<{
  accent?: string
  heading?: string
  file?: string
  titlebar?: string
  chip?: string
  chrome?: boolean
  wash?: 'corner' | 'site' | 'template'
}>(), {
  accent: undefined,
  heading: undefined,
  file: undefined,
  titlebar: 'shell',
  chip: undefined,
  chrome: true,
  wash: undefined,
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))
</script>

<template>
  <div class="slidev-layout dd-terminal relative overflow-hidden" :style="style">
    <Wash :accent="accent" :wash="wash" />
    <Chrome v-if="chrome" :accent="accent" :chip="chip" />
    <div class="dd-content h-full flex flex-col">
      <h2 v-if="heading" class="dd-window-heading">{{ heading }}</h2>
      <div class="dd-window flex-1">
        <div class="dd-window-titlebar">
          <span class="dd-window-label">{{ titlebar }}</span>
          <span v-if="file" class="dd-window-file">{{ file }}</span>
        </div>
        <div class="dd-window-body dd-code-frame">
          <SnippetScope :file="file">
            <slot />
          </SnippetScope>
        </div>
      </div>
    </div>
  </div>
</template>

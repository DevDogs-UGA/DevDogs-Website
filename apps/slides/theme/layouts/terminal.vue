<script setup lang="ts">
// Terminal / shell-output slide. Put a fenced ```bash (or similar) block in
// the default slot; it's rendered inside a faux terminal window chrome.
// The titlebar shows `file` when given (a real file path, e.g.
// `file: supabase/migrations/0002_profiles.sql`), else falls back to
// `titlebar` (any freeform titlebar text, e.g. "supabase dashboard → SQL
// editor").
// Frontmatter: accent, file, titlebar (default "shell"), chip, chrome, wash
// (see LAYOUTS.md)
//   ---
//   layout: terminal
//   accent: emerald
//   titlebar: supabase dashboard → SQL editor
//   ---
//   ```sql
//   select * from messages;
//   ```
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
  file?: string
  titlebar?: string
  chip?: string
  chrome?: boolean
  wash?: 'corner' | 'site' | 'template'
}>(), {
  accent: undefined,
  file: undefined,
  titlebar: 'shell',
  chip: undefined,
  chrome: true,
  wash: undefined,
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))
const titlebarText = computed(() => props.file ?? props.titlebar)
</script>

<template>
  <div class="slidev-layout dd-terminal relative overflow-hidden" :style="style">
    <Wash :accent="accent" :wash="wash" />
    <Chrome v-if="chrome" :accent="accent" :chip="chip" />
    <div class="dd-content dd-terminal-content h-full flex flex-col justify-center">
      <div class="dd-terminal-window">
        <div class="dd-terminal-titlebar">
          <span class="dd-terminal-dot" style="background:#FF6467" />
          <span class="dd-terminal-dot" style="background:#FFB900" />
          <span class="dd-terminal-dot" style="background:#00D492" />
          <span class="dd-terminal-title">{{ titlebarText }}</span>
        </div>
        <div class="dd-terminal-body">
          <SnippetScope :file="file">
            <slot />
          </SnippetScope>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dd-terminal-window {
  border-radius: 0.75rem;
  overflow: hidden;
  background: var(--dd-panel);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent);
}

.dd-terminal-titlebar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 0.9rem;
  background: #0000002e;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
}

.dd-terminal-dot {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 999px;
}

.dd-terminal-title {
  margin-left: 0.5rem;
  font-family: 'Cascadia Code', monospace;
  font-size: 0.8rem;
  color: var(--dd-muted);
}

.dd-terminal-body {
  padding: 0.75rem 1.25rem;
  /* Shiki's own code block draws its own background/padding by default;
     inside the terminal window chrome we want the code to fill the window
     instead of drawing a second box inside it. */
  --slidev-code-background: transparent;
  --slidev-code-padding: 0;
  --slidev-code-radius: 0;
  /* A hair tighter than Slidev's 18px so a 22-line migration fits the safe
     area without shrinking the type. */
  --slidev-code-line-height: 17px;
}

.dd-terminal-body :deep(pre) {
  margin: 0;
  background: transparent !important;
}
</style>

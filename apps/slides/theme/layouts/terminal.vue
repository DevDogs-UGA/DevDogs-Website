<script setup lang="ts">
// Terminal / shell-output slide. Put a fenced ```bash (or similar) block in
// the default slot; it's rendered inside a faux terminal window chrome.
// Frontmatter: accent, title (window title, default "shell")
//   ---
//   layout: terminal
//   accent: emerald
//   title: supabase dashboard → SQL editor
//   ---
//   ```sql
//   select * from messages;
//   ```
import { computed } from 'vue'
import { accentHex } from '../accents'

const props = withDefaults(defineProps<{
  accent?: string
  title?: string
}>(), {
  accent: undefined,
  title: 'shell',
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))
</script>

<template>
  <div class="slidev-layout dd-terminal relative overflow-hidden" :style="style">
    <div class="dd-corner-wash" />
    <div class="dd-content h-full flex flex-col justify-center">
      <div class="dd-terminal-window">
        <div class="dd-terminal-titlebar">
          <span class="dd-terminal-dot" style="background:#FF6467" />
          <span class="dd-terminal-dot" style="background:#FFB900" />
          <span class="dd-terminal-dot" style="background:#00D492" />
          <span class="dd-terminal-title">{{ title }}</span>
        </div>
        <div class="dd-terminal-body">
          <slot />
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
  padding: 1rem 1.25rem;
}

.dd-terminal-body :deep(pre) {
  margin: 0;
  background: transparent !important;
}
</style>

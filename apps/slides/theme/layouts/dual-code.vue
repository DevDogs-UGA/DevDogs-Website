<script setup lang="ts">
// Two-column Next.js | Flutter code panel — the workhorse layout for the
// dual-track sections. Built on Slidev's named-slot convention (like the
// built-in two-cols theme layout), but with fixed, labeled columns instead
// of generic left/right.
//
// Frontmatter: accent, title (optional heading rendered above both
// columns — use this instead of a markdown `#` so it doesn't get trapped
// inside the left slot), leftLabel (default "Next.js"), rightLabel
// (default "Flutter")
// Slots: default (left column, Next.js) and `right` (right column, Flutter)
//   ---
//   layout: dual-code
//   accent: emerald
//   title: Sign in
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
import { computed } from 'vue'
import { accentHex } from '../accents'

const props = withDefaults(defineProps<{
  accent?: string
  title?: string
  leftLabel?: string
  rightLabel?: string
}>(), {
  accent: undefined,
  title: undefined,
  leftLabel: 'Next.js',
  rightLabel: 'Flutter',
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))
</script>

<template>
  <div class="slidev-layout dd-dual-code relative overflow-hidden" :style="style">
    <div class="dd-corner-wash" />
    <div class="dd-content h-full flex flex-col">
      <h2 v-if="title" class="dd-dual-code-heading">{{ title }}</h2>
      <div class="grid grid-cols-2 gap-4 flex-1 min-h-0">
        <div class="dd-dual-code-col">
          <p class="dd-dual-code-label">{{ leftLabel }}</p>
          <div class="dd-dual-code-body">
            <slot />
          </div>
        </div>
        <div class="dd-dual-code-col dd-dual-code-col-right">
          <p class="dd-dual-code-label">{{ rightLabel }}</p>
          <div class="dd-dual-code-body">
            <slot name="right" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dd-dual-code-col {
  min-width: 0;
  border-left: 3px solid color-mix(in srgb, var(--accent) 60%, transparent);
  padding-left: 1rem;
}

.dd-dual-code-col-right {
  border-left-color: var(--dd-muted);
  opacity: 0.96;
}

.dd-dual-code-label {
  margin: 0 0 0.5rem 0;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent);
}

.dd-dual-code-body :deep(pre) {
  font-size: 0.85rem;
}
</style>

<script setup lang="ts">
// Agenda slide — a preset of `numbered-list` (same accent-numbered rows with
// hairline dividers), kept as its own layout name because "agenda" reads
// better in deck frontmatter than "numbered-list" for this specific slide.
// Frontmatter: accent, chip, chrome, wash (see LAYOUTS.md)
//   ---
//   layout: agenda
//   accent: cyan
//   ---
//   # Tonight
//
//   - Supabase, the tour
//   - Build against it
//   - Dashboard tour
//   - How the monorepo uses it
import NumberedList from './numbered-list.vue'
</script>

<template>
  <NumberedList v-bind="$attrs">
    <slot />
  </NumberedList>
</template>

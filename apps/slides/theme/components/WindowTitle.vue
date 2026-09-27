<script setup lang="ts">
// A code window's titlebar content: its label, then its file. The generic
// labels are icons (a terminal, a file of code), so the path gets the room;
// anything else (Next.js, Flutter, Dashboard → SQL Editor) stays text. A
// path too long for the bar loses its start, not its end, so the file name
// always shows: "…/migrations/20260928000000_guestbook.sql".
import { computed } from 'vue'
import ArrowText from './ArrowText.vue'

const props = defineProps<{
  label?: string
  file?: string
}>()

const icon = computed(() => ({ terminal: 'terminal', editor: 'editor' } as const)[props.label?.toLowerCase() ?? ''])
</script>

<template>
  <span class="dd-window-label" :title="icon ? label : undefined">
    <ph-terminal-window-bold v-if="icon === 'terminal'" class="dd-window-icon" />
    <ph-file-code-bold v-else-if="icon === 'editor'" class="dd-window-icon" />
    <ArrowText v-else :text="label" />
  </span>
  <span v-if="file" class="dd-window-file"><span dir="ltr">{{ file }}</span></span>
</template>

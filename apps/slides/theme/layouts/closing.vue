<script setup lang="ts">
// Exit / "before you go" slide — like `title` but meant for the last slide
// (thanks + where to go next). Pairs well with a `qr` slide right after it
// for attendance/Discord.
// Frontmatter: accent, subtitle, chip, chrome, wash (see LAYOUTS.md)
//   ---
//   layout: closing
//   accent: cyan
//   subtitle: See you next week
//   ---
//   # Thanks for coming
import { computed } from 'vue'
import { accentHex } from '../accents'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'

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
</script>

<template>
  <div class="slidev-layout dd-closing relative overflow-hidden" :style="style">
    <Wash :accent="accent" :wash="wash" />
    <Chrome v-if="chrome" :accent="accent" :chip="chip" />
    <div class="dd-content h-full flex flex-col justify-center items-center text-center">
      <div class="text-6xl">
        <slot />
      </div>
      <p v-if="subtitle" class="mt-6 text-xl text-dd-muted">
        {{ subtitle }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
// A generic accent-numbered row list, with a hairline divider between rows —
// the same shape as `agenda`, but usable for any list of steps/rules/etc.
// `agenda` is now a thin preset of this layout (see agenda.vue).
// Frontmatter: accent, chip, chrome, wash (see LAYOUTS.md)
//   ---
//   layout: numbered-list
//   accent: cyan
//   ---
//   # Merge conflict prevention
//
//   - Small PRs, one feature per branch
//   - Pull `main` before you start a session
//   - Run `pnpm install` and commit the lockfile together
import { computed } from 'vue'
import { accentHex } from '../accents'
import Wash from '../components/Wash.vue'
import Chrome from '../components/Chrome.vue'
import NumberedListBody from '../components/NumberedListBody.vue'

const props = withDefaults(defineProps<{
  accent?: string
  chip?: string
  chrome?: boolean
  wash?: 'site' | 'template'
}>(), {
  accent: undefined,
  chip: undefined,
  chrome: true,
  wash: undefined,
})

const style = computed(() => ({ '--accent': accentHex(props.accent) }))
</script>

<template>
  <div class="slidev-layout dd-numbered-list-layout relative overflow-hidden" :style="style">
    <Wash :accent="accent" :wash="wash" />
    <Chrome v-if="chrome" :accent="accent" :chip="chip" />
    <div class="dd-content h-full flex flex-col justify-center">
      <NumberedListBody>
        <slot />
      </NumberedListBody>
    </div>
  </div>
</template>

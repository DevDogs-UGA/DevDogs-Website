<script setup lang="ts">
// Replaces the built-in copy button on every code block (base.css hides
// that one). A block can hold a whole file, and the built-in copies all of
// it; this copies the block's focus, the same code the Discord button posts
// (see lib/snippets.ts).
import { ref } from 'vue'
import type { Snippet } from '../lib/snippets'

const props = defineProps<{
  snippet: () => Snippet
}>()

const copied = ref(false)
let reset: ReturnType<typeof setTimeout> | undefined

async function copy() {
  await navigator.clipboard.writeText(props.snippet().code)
  copied.value = true
  clearTimeout(reset)
  reset = setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <button
    class="dd-snippet-copy absolute top-0 right-0 z-10 transition opacity-0 group-hover:opacity-40 hover:!opacity-100"
    :title="copied ? 'Copied' : 'Copy'"
    @click="copy"
  >
    <ph-check-circle v-if="copied" class="p-2 w-8 h-8" />
    <ph-clipboard v-else class="p-2 w-8 h-8" />
  </button>
</template>

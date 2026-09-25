<script setup lang="ts">
// The Discord button that sits beside a code block's copy button, in the
// presenter view only. Also registers the block with the `p` shortcut
// (setup/shortcuts.ts). See lib/snippets.ts.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useSlideContext } from '@slidev/client'
import { canPost, postSnippet, registerSnippet, type Snippet } from '../lib/snippets'

const props = defineProps<{
  snippet: () => Snippet
}>()

const { $renderContext, $page } = useSlideContext()
const active = computed(() => canPost && $renderContext.value === 'presenter')

const state = ref<'idle' | 'posting' | 'posted' | 'failed'>('idle')
const error = ref('')
let reset: ReturnType<typeof setTimeout> | undefined

async function post() {
  clearTimeout(reset)
  state.value = 'posting'
  try {
    await postSnippet(props.snippet())
    state.value = 'posted'
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    state.value = 'failed'
    console.error('[snippets]', e)
  }
  reset = setTimeout(() => (state.value = 'idle'), state.value === 'failed' ? 6000 : 2500)
}

let unregister: (() => void) | undefined
onMounted(() => {
  if (active.value) unregister = registerSnippet($page.value, post)
})
onUnmounted(() => {
  unregister?.()
  clearTimeout(reset)
})

const label = computed(() => ({
  idle: 'Post to Discord (p posts the whole slide)',
  posting: 'Posting…',
  posted: 'Posted',
  failed: `Failed: ${error.value}`,
})[state.value])
</script>

<template>
  <button
    v-if="active"
    class="dd-snippet-post absolute top-0 right-8 z-10 transition"
    :class="state === 'idle' ? 'opacity-40 hover:opacity-100' : 'opacity-100'"
    :title="label"
    :disabled="state === 'posting'"
    @click="post"
  >
    <ph-circle-notch v-if="state === 'posting'" class="p-2 w-8 h-8 animate-spin" />
    <ph-check-circle v-else-if="state === 'posted'" class="p-2 w-8 h-8 text-emerald" />
    <ph-warning-circle v-else-if="state === 'failed'" class="p-2 w-8 h-8 text-red" />
    <ph-discord-logo v-else class="p-2 w-8 h-8" />
  </button>
</template>

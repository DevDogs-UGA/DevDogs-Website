<script setup lang="ts">
// A helper banner below a code window (not in it: it moves itself to the
// slot its layout keeps under the window, lib/tips.ts), explaining the
// framework feature the current click's lines use. One numbered slot per click (the
// slide's click count, from 0); a click without its own slot keeps the
// last tip before it. It follows the slide's clicks and never adds any.
//
//   <CodeTips>
//   <template #0>
//
//   `useEffect` runs after the component renders.
//
//   </template>
//   <template #2>…</template>
//   </CodeTips>
import { computed, useSlots } from 'vue'
import { useSlideContext } from '@slidev/client'
import { useTipsTarget } from '../lib/tips'

const slots = useSlots()
const target = useTipsTarget()
const { $clicks } = useSlideContext()

const shown = computed(() => {
  const numbered = Object.keys(slots).map(Number).filter(n => !Number.isNaN(n)).sort((a, b) => a - b)
  return numbered.filter(n => n <= $clicks.value).at(-1) ?? numbered[0]
})
</script>

<template>
  <Teleport defer :to="`#${target}`" :disabled="!target">
    <div v-if="shown !== undefined" class="dd-code-tip">
      <ph-lightbulb-filament-bold class="dd-code-tip-icon" />
      <Transition name="dd-tip" mode="out-in">
        <div :key="shown" class="dd-code-tip-body">
          <component :is="slots[String(shown)]" />
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.dd-code-tip {
  flex: none;
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.55rem 0.8rem;
  border-radius: 0.6rem;
  background: color-mix(in srgb, var(--accent) 14%, var(--dd-card-fill));
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  box-shadow: 0 0.5rem 1.2rem -0.6rem rgb(0 0 0 / 60%);
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--dd-ink);
}

.dd-code-tip-icon {
  flex: none;
  margin-top: 0.15em;
  color: var(--accent);
}

.dd-code-tip-body :deep(p) {
  margin: 0;
  line-height: 1.45;
}

.dd-code-tip-body :deep(code) {
  font-size: 0.95em;
  color: var(--accent);
}

.dd-tip-enter-active,
.dd-tip-leave-active {
  transition: opacity 0.2s ease;
}

.dd-tip-enter-from,
.dd-tip-leave-to {
  opacity: 0;
}
</style>

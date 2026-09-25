<script setup lang="ts">
// The shared guts of `numbered-list` and `agenda` (a numbered-list preset):
// write a normal markdown list in the default slot and each item is
// auto-numbered in the accent color, with a hairline divider between rows.
// Pulled out into its own component so neither layout has to duplicate the
// counter/divider CSS.
</script>

<template>
  <div class="dd-numbered-list">
    <slot />
  </div>
</template>

<style scoped>
.dd-numbered-list :deep(ul) {
  list-style: none;
  counter-reset: dd-numbered-item;
  padding-left: 0;
}

.dd-numbered-list :deep(li) {
  counter-increment: dd-numbered-item;
  margin-left: 0;
  padding: 0.65em 0;
  font-size: 1.5rem;
  display: flex;
  align-items: baseline;
  gap: 0.75em;
  border-bottom: 1px solid var(--dd-hairline);
}

.dd-numbered-list :deep(li:last-child) {
  border-bottom: none;
}

.dd-numbered-list :deep(li)::before {
  content: counter(dd-numbered-item, decimal-leading-zero);
  color: var(--accent);
  font-family: 'Cascadia Code', monospace;
  font-weight: 700;
}
</style>

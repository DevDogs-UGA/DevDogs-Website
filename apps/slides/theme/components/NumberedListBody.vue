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
  /* The number used to be a flex sibling of the item's own text (`display:
     flex` on the <li>). That's fine for a plain-text item, but the moment
     an item's text has any inline markup (**bold**, `code`, a link -- each
     of those splits the <li>'s contents into more than one child node),
     every one of those child text runs became its OWN flex item and wrapped
     independently, so a wrapped line looked like broken, misaligned
     columns instead of one paragraph. Position the number instead, so the
     item's actual content is a single normal flowing block. */
  position: relative;
  margin-left: 0;
  padding: 0.65em 0 0.65em 2.75em;
  font-size: 1.5rem;
  border-bottom: 1px solid var(--dd-hairline);
}

.dd-numbered-list :deep(li:last-child) {
  border-bottom: none;
}

.dd-numbered-list :deep(li)::before {
  content: counter(dd-numbered-item, decimal-leading-zero);
  position: absolute;
  left: 0;
  color: var(--accent);
  font-family: 'Cascadia Code', monospace;
  font-weight: 700;
}
</style>

<script setup lang="ts">
// The shared guts of `numbered-list` and `agenda` (a numbered-list preset):
// write a normal markdown list in the default slot and each item is
// auto-numbered in the accent color, with a hairline divider between rows.
// Pulled out into its own component so neither layout has to duplicate the
// counter/divider CSS.
//
// A dimmed sub-line: nest a plain item under a numbered one for a one-line
// note underneath it (steps, a caveat, whatever doesn't deserve its own
// number) --
//   - Turn on **GitHub 2FA**
//     - Settings → Password and authentication → Enable two-factor authentication
// The nested item renders smaller, in `--dd-grey-support`, with no number of
// its own and no hairline of its own -- a footnote under the row above it,
// not a new step. See LAYOUTS.md's `numbered-list` section.
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
  padding: 0.25em 0 0.25em 2.75em;
  font-size: 1.3rem;
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

/* The dimmed sub-line -- a nested <ul>/<li> under a numbered item. Higher
   specificity than the two rules above (an extra ancestor each), so it wins
   without needing !important: no number, no hairline, smaller and dimmer. */
.dd-numbered-list :deep(li) ul {
  list-style: none;
  counter-reset: none;
  padding-left: 0;
  margin: 0.15em 0 0;
}

.dd-numbered-list :deep(li) ul li {
  counter-increment: none;
  margin-left: 0;
  padding: 0;
  border-bottom: none;
  font-size: 1.05rem;
  font-weight: 400;
  color: var(--dd-grey-support);
}

.dd-numbered-list :deep(li) ul li::before {
  content: none;
}
/* A settings table in a sub-line (e.g. a dashboard form to fill in). */
.dd-numbered-list :deep(.dd-config-table) {
  margin: 0.1em 0 0;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.dd-numbered-list :deep(.dd-config-table th),
.dd-numbered-list :deep(.dd-config-table td) {
  padding: 0.1em 1.2em 0.1em 0;
  text-align: left;
  border-bottom: 1px solid var(--dd-hairline);
}

.dd-numbered-list :deep(.dd-config-table th) {
  font-weight: 600;
  color: var(--dd-grey-secondary);
  white-space: nowrap;
}

.dd-numbered-list :deep(.dd-config-table td) {
  color: var(--dd-ink);
}
</style>

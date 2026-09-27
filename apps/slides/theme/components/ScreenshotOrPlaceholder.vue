<script setup lang="ts">
// Shows an image if it exists under public/, otherwise a tidy placeholder
// naming the path it's waiting on. Built for the `03-competition.md`
// conflict slide's VS Code screenshot (Sloan has to take that one by hand --
// see the scratch merge-conflict-demo repo's README), but generic to any
// deck asset that might not exist yet.
//
// A plain `<img>` with an `@error` fallback, not a bundler import: Slidev's
// build fails if a slide *imports* a missing asset by path, but a plain
// string `src` on an `<img>` is just a URL the browser 404s on at runtime --
// the build never touches it. That's the whole point here: this component
// has to build cleanly whether or not the file exists yet.
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  src: string
  alt?: string
}>(), {
  alt: 'Screenshot',
})

const failed = ref(false)
</script>

<template>
  <div class="dd-screenshot-slot">
    <img
      v-if="!failed"
      :src="src"
      :alt="alt"
      class="dd-screenshot-img"
      @error="failed = true"
    >
    <div v-else class="dd-screenshot-placeholder">
      <p class="dd-screenshot-placeholder-label">Screenshot pending</p>
      <p class="dd-screenshot-placeholder-path">decks/public{{ src }}</p>
    </div>
  </div>
</template>

<style scoped>
/* Takes whatever height its column has left (a code window's frame is a
   flex column, so a caption below keeps its natural size), and the image
   fits inside it whole. */
.dd-screenshot-slot {
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dd-screenshot-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 0.5rem;
}

.dd-screenshot-placeholder {
  width: auto;
  max-width: 100%;
  height: 7rem;
  aspect-ratio: 16 / 9;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  border: 1px dashed var(--dd-hairline);
  border-radius: 0.75rem;
  background: var(--dd-card-fill);
  padding: 1rem;
  text-align: center;
}

.dd-screenshot-placeholder-label {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--dd-grey-support);
}

.dd-screenshot-placeholder-path {
  margin: 0;
  font-family: 'Cascadia Code', monospace;
  font-size: 0.8rem;
  color: var(--dd-grey-dim);
}
</style>

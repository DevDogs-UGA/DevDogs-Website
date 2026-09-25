<script setup lang="ts">
// DevDogs "DogPack" project mark — one bold paw, four pads gathered around a
// center. Ported 1:1 (viewBox + paths) from the platform's
// apps/platform/src/components/ProjectsSection/project-icons.tsx
// (`DogPackIcon`). Renders in currentColor, sized to sit on the text
// baseline like a glyph — the box is the paw's own bounds, set at 0.68em of
// cap height (see that file's `PROJECT_ICONS` height table).
</script>

<template>
  <svg
    viewBox="5.07 9.42 37.86 31.18"
    height="0.68em"
    width="auto"
    fill="currentColor"
    aria-hidden="true"
    class="dd-project-mark"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M 24 24.6 C 28.6 24.6 34 26.8 34.8 31.6 C 35.5 36.4 30.8 40.6 24 40.6 C 17.2 40.6 12.5 36.4 13.2 31.6 C 14 26.8 19.4 24.6 24 24.6 Z" />
    <ellipse cx="18" cy="15" rx="4.4" ry="5.6" transform="rotate(-8 18 15)" />
    <ellipse cx="30" cy="15" rx="4.4" ry="5.6" transform="rotate(8 30 15)" />
    <ellipse cx="9.6" cy="22.6" rx="4.2" ry="5.4" transform="rotate(-30 9.6 22.6)" />
    <ellipse cx="38.4" cy="22.6" rx="4.2" ry="5.4" transform="rotate(30 38.4 22.6)" />
  </svg>
</template>

<style scoped>
.dd-project-mark {
  display: inline-block;
  vertical-align: -0.03em;
  color: currentColor;
}
</style>

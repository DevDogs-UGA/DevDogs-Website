<script setup lang="ts">
// DevDogs "DogPack" project mark. The geometry is @devdogsuga/brand's one copy
// (`@devdogsuga/brand/marks`); this component owns only the <svg> element.
// Renders in currentColor, sized to sit on the text baseline like a glyph: the
// viewBox is cropped to the ink and the height is 0.68em of cap height.
import { markBody, MARKS } from '@devdogsuga/brand/marks'

const { viewBox } = MARKS.dogpack
const body = markBody('dogpack')
</script>

<template>
  <svg
    :viewBox="viewBox"
    height="0.68em"
    width="auto"
    aria-hidden="true"
    class="dd-project-mark"
    xmlns="http://www.w3.org/2000/svg"
    v-html="body"
  />
</template>

<style scoped>
.dd-project-mark {
  display: inline-block;
  vertical-align: -0.03em;
  color: currentColor;
}
</style>

// Code blocks as editor viewports.
//
// Inside a code window (the `.dd-code-frame` body of the dual-code and
// terminal layouts) a block fills the window's height, however long its code
// is, and holds a whole file (see setup/transformers.ts). The file slides
// behind the window so the highlighted lines sit in the middle, with the
// dimmed code around them filling the rest, and it glides to the next range
// on each click. Outside a frame the block is its natural height and nothing
// moves.
import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue'

// Top of `el` in `ancestor`'s box. offsetTop ignores transforms, so this is
// where a Magic Move token lands, not where its animation currently has it.
function topIn(el: HTMLElement, ancestor: HTMLElement): number {
  let y = 0
  let e: HTMLElement | null = el
  while (e && e !== ancestor) {
    y += e.offsetTop
    e = e.offsetParent as HTMLElement | null
  }
  return y
}

// `overview` (a build's recap click): instead of panning, shrink the whole
// file to fit the window, so the step's changes show in context at once.
export function useCodeViewport(
  root: Ref<HTMLElement | undefined>,
  track: Ref<HTMLElement | undefined>,
  overview?: Ref<boolean>,
) {
  const offset = ref(0)
  const scale = ref(1)
  // No glide into the first position, only between clicks. A Magic Move
  // block highlights its first step a few ticks after mounting, so the
  // first position isn't known on mount either; give it a moment.
  const animate = ref(false)
  let settle: ReturnType<typeof setTimeout> | undefined
  let settled = false
  // Slidev mounts neighbouring slides hidden (height 0). Coming into view
  // is a jump to position too, not a glide from the top of the file.
  let shown = false

  function measure() {
    const r = root.value
    const t = track.value
    if (!r || !t) return
    const height = r.clientHeight
    if (height && !shown && settled) {
      animate.value = false
      requestAnimationFrame(() => requestAnimationFrame(() => (animate.value = true)))
    }
    shown = height > 0
    const total = t.offsetHeight
    scale.value = overview?.value && height && total > height ? height / total : 1
    if (!height || total <= height || overview?.value) {
      offset.value = 0
      return
    }
    // Nothing dimmed means no range is active: show the top of the file.
    const lit = t.querySelector('.slidev-code-dishonored')
      ? Array.from(t.querySelectorAll<HTMLElement>('.slidev-code-highlighted'))
      : []
    if (!lit.length) {
      offset.value = 0
      return
    }
    const tops = lit.map(el => topIn(el, t))
    const top = Math.min(...tops)
    const bottom = Math.max(...lit.map((el, i) => tops[i] + el.offsetHeight))
    // Centred when the range fits between the window's soft edges
    // (base.css, 0.7rem each); otherwise its first line just below the top
    // edge.
    const fade = 11.2
    const target = bottom - top > height - 2 * fade
      ? top - fade
      : (top + bottom) / 2 - height / 2
    offset.value = Math.round(Math.max(0, Math.min(target, total - height)))
  }

  let frame = 0
  function schedule() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(measure)
  }

  let mutations: MutationObserver | undefined
  let resizes: ResizeObserver | undefined
  onMounted(() => {
    measure()
    settle = setTimeout(() => {
      settled = true
      animate.value = true
    }, 700)
    mutations = new MutationObserver(schedule)
    if (track.value) {
      mutations.observe(track.value, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class'],
      })
    }
    resizes = new ResizeObserver(schedule)
    if (root.value) resizes.observe(root.value)
    if (track.value) resizes.observe(track.value)
  })
  if (overview) watch(overview, schedule)

  onUnmounted(() => {
    cancelAnimationFrame(frame)
    clearTimeout(settle)
    mutations?.disconnect()
    resizes?.disconnect()
  })

  return { offset, scale, animate }
}

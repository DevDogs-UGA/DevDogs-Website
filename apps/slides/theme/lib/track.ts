// Track mode: `?track=web` or `?track=mobile` in the URL, so the two demo
// laptops (see LAYOUTS.md) can run the exact same deck and each only show
// its own half of every dual-track slide.
//
// The `Track` value is a Vue `ref` shared by every component that imports it
// — one module-level `ref`, not one per component instance — so setting it
// anywhere (e.g. reading the URL once on load) is instantly visible
// everywhere else in the deck.
import { ref } from 'vue'

export type TrackName = 'web' | 'mobile'

const STORAGE_KEY = 'dd-track'

function isTrackName(value: string | null): value is TrackName {
  return value === 'web' || value === 'mobile'
}

// Read once, in this order: the URL wins (so a shared link always sets the
// track it names), then whatever this tab remembered last time (so clicking
// "next slide" — which never re-runs this file — doesn't lose it), then
// nothing (both tracks show, which is what the PDF export needs).
function readInitialTrack(): TrackName | undefined {
  if (typeof window === 'undefined') return undefined

  const fromUrl = new URLSearchParams(window.location.search).get('track')
  if (isTrackName(fromUrl)) {
    window.sessionStorage.setItem(STORAGE_KEY, fromUrl)
    return fromUrl
  }

  const fromStorage = window.sessionStorage.getItem(STORAGE_KEY)
  return isTrackName(fromStorage) ? fromStorage : undefined
}

// One shared ref for the whole deck — every slide and every layout reads
// this same value.
export const track = ref<TrackName | undefined>(readInitialTrack())

export function setTrack(next: TrackName | undefined) {
  track.value = next

  if (typeof window === 'undefined') return

  if (next) {
    window.sessionStorage.setItem(STORAGE_KEY, next)
  } else {
    window.sessionStorage.removeItem(STORAGE_KEY)
  }

  // Keep the address bar in sync (without a page reload) so copying the URL
  // — to open the presenter view, or to send it to the other laptop — carries
  // the track along.
  const url = new URL(window.location.href)
  if (next) url.searchParams.set('track', next)
  else url.searchParams.delete('track')
  window.history.replaceState(window.history.state, '', url)
}

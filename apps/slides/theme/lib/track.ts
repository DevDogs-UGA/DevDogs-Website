// Track mode: `?track=web` or `?track=mobile` in the URL, so the two demo
// laptops (see LAYOUTS.md) can run the exact same deck and each only show
// its own half of every dual-track slide.
//
// The `Track` value is a Vue `ref` shared by every component that imports it
// — one module-level `ref`, not one per component instance — so setting it
// anywhere (e.g. reading the URL once on load) is instantly visible
// everywhere else in the deck.
import { ref } from "vue";

export type TrackName = "web" | "mobile";

// Code colour by stack: purple where the Next.js code diverges, sky for
// Flutter. Emerald is kept for SQL, which both stacks run as-is.
export const TRACK_ACCENT = {
  web: "purple",
  mobile: "sky",
} as const satisfies Record<TrackName, string>;

const STORAGE_KEY = "dd-track";

// Set by theme/vite.config.ts: SLIDES_TRACK on a demo laptop, else ''.
declare const __DD_TRACK__: string;

function isTrackName(value: string | null): value is TrackName {
  return value === "web" || value === "mobile";
}

// Read once, in this order: the URL wins (so a shared link always sets the
// track it names), then whatever this tab remembered last time (so clicking
// "next slide" — which never re-runs this file — doesn't lose it), then
// the demo laptop's track, then nothing (both tracks show, which is what the
// PDF export needs).
function readInitialTrack(): TrackName | undefined {
  if (typeof window === "undefined") return undefined;

  const fromUrl = new URLSearchParams(window.location.search).get("track");
  if (isTrackName(fromUrl)) {
    window.sessionStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl;
  }

  const fromStorage = window.sessionStorage.getItem(STORAGE_KEY);
  if (isTrackName(fromStorage)) return fromStorage;

  // A demo laptop's deck (`pnpm follow web`) defaults to its own track.
  return isTrackName(__DD_TRACK__) ? __DD_TRACK__ : undefined;
}

// One shared ref for the whole deck — every slide and every layout reads
// this same value.
export const track = ref<TrackName | undefined>(readInitialTrack());

export function setTrack(next: TrackName | undefined) {
  track.value = next;

  if (typeof window === "undefined") return;

  if (next) {
    window.sessionStorage.setItem(STORAGE_KEY, next);
  } else {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }

  // Keep the address bar in sync (without a page reload) so copying the URL
  // — to open the presenter view, or to send it to the other laptop — carries
  // the track along.
  const url = new URL(window.location.href);
  if (next) url.searchParams.set("track", next);
  else url.searchParams.delete("track");
  window.history.replaceState(window.history.state, "", url);
}

// A value that can differ by track, e.g. a window's file:
// `{ web: '~/lib/supabase.ts', mobile: '~/lib/main.dart' }`. With no track
// set (the PDF), both, joined.
export type PerTrack = string | Partial<Record<TrackName, string>>;

export function forTrack(value: PerTrack | undefined): string | undefined {
  if (!value || typeof value === "string") return value;
  return track.value
    ? value[track.value]
    : [value.web, value.mobile].filter(Boolean).join(" · ");
}

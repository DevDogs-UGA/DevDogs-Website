/**
 * The club's brand tokens: palette, contact/social copy, embedded fonts and
 * the mark/wordmark artwork — extracted from `@devdogsuga/og`, which keeps
 * the Satori templates that render them.
 *
 * This is deliberately a "token slice", not the whole of what og exports:
 * no templates, no primitives, no Satori-facing layout code. A consumer that
 * only wants the club's colours or marks (a newsletter, a future site page)
 * should not pull in `react`-shaped template code to get them.
 *
 * `@devdogsuga/brand/event` is a SEPARATE entry point and deliberately so —
 * see `event.ts` for why: it holds the club's timezone and the
 * meeting-to-card formatting, and importing it must not drag this module's
 * embedded fonts and artwork along.
 */
export {
  BLOCK_SHADOW,
  ACCENT,
  CONTACT,
  MAUVE,
  THEME,
  WHITE,
  WORDMARK_METRICS,
} from "./brand.js";
export { loadFonts, type LoadedFont } from "./fonts.js";
export {
  type Asset,
  GDG_MARK,
  GDGC_UGA,
  GDGC_UGA_LIGHT,
  MARK,
  WORDMARK_ON_DARK,
  WORDMARK_ON_LIGHT,
} from "./generated/assets.js";

/**
 * Re-exported for convenience, and safe to take from here: these are types and
 * one pure function, so a consumer that only wants `EventDetail` pays nothing.
 * A consumer that must NOT pull in the fonts and artwork — anything a browser
 * bundles — should import `@devdogsuga/brand/event` directly.
 */
export {
  type CardableMeeting,
  type EventDetail,
  EVENT_TZ,
  formatEventDate,
  formatEventTime,
  meetingCardDetail,
  meetingLocation,
  type MeetingCardInput,
} from "./event.js";

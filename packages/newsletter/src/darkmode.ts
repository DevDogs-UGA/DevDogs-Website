/**
 * Background painting and dark-mode color pinning.
 *
 * The newsletter is dark-native, but dark-mode mail clients do not leave
 * "already dark" alone: Outlook.com, new Outlook and Outlook mobile run every
 * color through a contrast-repair pass, and classic Outlook's Word engine
 * does a full invert. Forensics on a received copy (2026-09-11) showed
 * exactly how the web Outlooks repaint: every INLINE background gets its
 * repaired value rewritten in place with `!important` — which by CSS rules no
 * stylesheet rule can ever outrank — while colors that live only in the
 * embedded stylesheet arrive untouched, and rewritten `bgcolor` attributes
 * stay presentational hints that any stylesheet rule beats.
 *
 * That asymmetry dictates the architecture: backgrounds are never painted
 * inline. Every painted element carries a `bc-` class, `paintCss()` supplies
 * the base rule (color plus the same-color gradient underlay of `solidBg`),
 * a `bgcolor` attribute covers clients without `<style>`, and `darkModeCss()`
 * re-asserts each color with `!important` for the clients that recolor
 * stylesheets. The web Outlooks leave one hook for those pins: each element
 * they recolor gains a `data-ogsc` (original color) or `data-ogsb` (original
 * background) attribute, rules scoped under those attributes escape their
 * conversion, and `<body>` keeps the one deliberate inline background as the
 * sacrificial donor that guarantees a `data-ogsb` above everything. Text
 * colors stay inline — Outlook's text repairs (lightening the dim tones)
 * read fine on the pinned surfaces. Borders split by role: Outlook repaints
 * border colors inline with `!important` too, so structural dividers are
 * painted 1px cells (full background armor) and only the card outlines
 * remain true borders, where the repaint reads as an intentional outline.
 * Classic
 * Outlook has no hook; its invert cannot be prevented, only tolerated (it
 * guarantees its own text contrast, and the reading pane offers a per-message
 * toggle back to the sent colors).
 *
 * Every element that paints a color therefore carries a utility class naming
 * the hex it paints (`tc-`/`bc-`/`brc-` for text, background, border), and
 * this module generates every rule from the same theme tokens the components
 * render with. `render.test.tsx` walks the rendered document and fails on any
 * inline background or any color that lacks its class, so the halves cannot
 * drift.
 */
import type { CSSProperties } from "react";
import {
  chipColors,
  dotGrid,
  GDGC,
  GDGC_DARK,
  HEADING_TINTS,
  KIND,
  PALETTE,
  slants,
  solidBg,
  UGA,
} from "./theme.js";

/** Class for an element whose `color` is `color`. */
export function tc(color: string): string {
  return `tc-${color.slice(1)}`;
}

/** Class for an element whose background is `color`. */
export function bc(color: string): string {
  return `bc-${color.slice(1)}`;
}

/** Class for an element with a `color`-colored border. */
export function brc(color: string): string {
  return `brc-${color.slice(1)}`;
}

const KINDS = Object.values(KIND);
const CHIPS = KINDS.flatMap((kind) =>
  [PALETTE.card, PALETTE.card2].map((ground) => chipColors(kind, ground)),
);

/** The GDGC email's light colors, which its dark version replaces. */
const CAMPAIGN_COLORS: string[] = [...new Set(Object.values(GDGC))];

/** Every background the components paint — the classes `paintCss` must feed. */
const BACKGROUNDS = [
  ...CAMPAIGN_COLORS,
  PALETTE.bg,
  PALETTE.bar,
  PALETTE.card,
  PALETTE.card2,
  // The divider color: structural dividers are painted 1px cells, not
  // borders, because the web Outlooks' dark mode repaints border colors
  // inline with !important and borders have no box-shadow armor.
  PALETTE.border,
  UGA,
  ...KINDS,
  ...CHIPS.map((chip) => chip.fill),
];

const PINS: {
  classFor: (color: string) => string;
  property: string;
  /** The campaign's dark replacements for this property. */
  campaignDark: Record<string, string>;
  colors: string[];
}[] = [
  {
    classFor: tc,
    property: "color",
    campaignDark: GDGC_DARK.color,
    colors: [
      ...CAMPAIGN_COLORS,
      PALETTE.ink,
      PALETTE.mute,
      PALETTE.dim,
      UGA,
      ...KINDS,
      ...CHIPS.map((chip) => chip.text),
      ...Object.values(HEADING_TINTS),
    ],
  },
  {
    classFor: bc,
    property: "background-color",
    campaignDark: GDGC_DARK.background,
    colors: BACKGROUNDS,
  },
  {
    classFor: brc,
    property: "border-color",
    campaignDark: GDGC_DARK.border,
    colors: [
      GDGC.ink,
      PALETTE.border,
      UGA,
      ...KINDS,
      ...CHIPS.map((chip) => chip.border),
    ],
  },
];

/** The slant stripe's texture class — always the UGA red. */
export const SLANTS_CLASS = "bg-slants";

/** The terminal bars' faint dot-grid texture class. */
export const DOT_GRID_CLASS = "bg-dots";

/** One camelCased style object as a CSS declaration block. */
function declarations(style: CSSProperties): string {
  return Object.entries(style)
    .map(
      ([property, value]) =>
        `${property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${String(value)}`,
    )
    .join(";");
}

/** The GDGC email's image pair: each graphic ships light and dark, one shown. */
export const LIGHT_IMAGE_CLASS = "gdgc-light";
export const DARK_IMAGE_CLASS = "gdgc-dark";

/**
 * The base paint layer: what actually colors every `bc-` background, since no
 * background is ever inline (see the module comment). Deliberately without
 * `!important` so the pins in `darkModeCss()` outrank it, and with the
 * texture rules last so their `background-image` wins the tie against the
 * flat `bc-` rule on the same element. The platform's /changelog pages embed
 * this too — the classes paint there exactly as they do in an inbox.
 *
 * The campaign's light surfaces skip the gradient underlay: the Gmail apps
 * offer no dark-mode hook to swap in the dark version, so they must stay
 * free to recolor surfaces together with the text they invert.
 */
export function paintCss({
  campaign = false,
}: { campaign?: boolean } = {}): string {
  return [
    ...[...new Set(BACKGROUNDS)].map(
      (color) =>
        `.${bc(color)}{${campaign && CAMPAIGN_COLORS.includes(color) ? `background-color:${color}` : declarations(solidBg(color))}}`,
    ),
    `.${SLANTS_CLASS}{${declarations(slants(UGA))}}`,
    `.${DOT_GRID_CLASS}{${declarations(dotGrid(PALETTE.bar, "rgba(255,255,255,.05)"))}}`,
  ].join("\n");
}

/**
 * `shadowArmor` adds the one declaration Outlook's dark transform provably
 * does not process (carrier probe, 2026-09-11): a huge same-color inset
 * `box-shadow`, painting the authored color OVER the `background-color`
 * Outlook injects inline with `!important`. The spread must reach the middle
 * of the tallest element that wears a `bc-` class — the 600px canvas table —
 * from every edge, hence 3000px. Armor belongs only in the `data-og*` scoped
 * layers: those apply exactly when Outlook has stamped the DOM, so no other
 * client ever renders the shadow (an inset shadow paints over
 * `background-image`, and would otherwise erase the dot-grid and slant
 * textures everywhere they work).
 *
 * With `campaign`, each GDGC light color is pinned to its `GDGC_DARK`
 * replacement instead of itself (and dropped where it has none), and the
 * image pairs swap — the dark version of the email in every client with a
 * dark-mode hook.
 */
function rules(
  scope: (selector: string) => string,
  shadowArmor = false,
  campaign = false,
): string {
  const pins = PINS.flatMap(({ classFor, property, campaignDark, colors }) =>
    [...new Set(colors)].flatMap((color) => {
      const value =
        campaign && CAMPAIGN_COLORS.includes(color)
          ? campaignDark[color]
          : color;
      if (!value) return [];
      const selector = `.${classFor(color)}`;
      const armor =
        shadowArmor && property === "background-color"
          ? `;box-shadow:inset 0 0 0 3000px ${value} !important`
          : "";
      return [`${scope(selector)}{${property}:${value} !important${armor}}`];
    }),
  );
  if (campaign)
    pins.push(
      `${scope(`.${LIGHT_IMAGE_CLASS}`)}{display:none !important}`,
      `${scope(`.${DARK_IMAGE_CLASS}`)}{display:block !important}`,
    );
  return pins.join("\n");
}
/**
 * The pinning stylesheet `ChangelogDocument` embeds. Three layers, weakest
 * first: a `color-scheme` declaration telling well-behaved clients the email
 * handles both schemes itself, the same pins under `prefers-color-scheme` for
 * clients that honor the media query (Apple Mail, Outlook for Mac), and the
 * `data-ogsc`/`data-ogsb` scoped pins for the web Outlooks, which apply their
 * recoloring in the DOM rather than through any media query.
 *
 * The scoped layers are where the real fight happens. The 2026 web Outlooks
 * compute every element's effective background from the full cascade and
 * inject the repaired value inline with `!important` — unbeatable by any
 * stylesheet color — so the scoped pins carry the box-shadow armor (see
 * `rules`) that repaints the authored color on top. The color pins still
 * matter for Outlook mobile's older transform, and the `<body>` donor in
 * `ChangelogDocument` guarantees a stamped ancestor so the scope always
 * matches in dark mode.
 *
 * The scoped rules are deliberately spartan: Outlook.com's CSS support only
 * stretches to an attribute selector on an ancestor (`[data-ogsc] .x`), not
 * compounded onto the element itself (`.x[data-ogsc]`), and a selector its
 * sanitizer rejects can take the whole rule down with it — so every pin is
 * its own single-selector rule, in the one shape the client is documented
 * to keep. Both attributes scope every rule because which one Outlook stamps
 * depends on whether it rewrote a color or a background up the tree.
 *
 * The GDGC campaign (`campaign`) is light-native, so the scoped layers swap
 * in its dark version instead of pinning it light. Pinning light cannot work
 * in the web Outlooks: they force light text onto any surface whose original
 * background they repaint, and no stylesheet outranks that (see the README).
 * Dark surfaces under that forced light text read as intended. Only Outlook's
 * own `data-og*` stamps trigger the swap; every other client shows the light
 * version (the Gmail apps recolor it themselves).
 */
export function darkModeCss({
  campaign = false,
}: { campaign?: boolean } = {}): string {
  return [
    ":root{color-scheme:light dark;supported-color-schemes:light dark}",
    // The campaign skips the media layer: the web Outlooks evaluate it
    // against the OS theme, not the reading pane's, so a light-themed
    // Outlook on a dark-themed Windows would match it and show the dark
    // version. The Changelog's pins are its own colors, so it never shows.
    ...(campaign
      ? []
      : [
          `@media (prefers-color-scheme: dark){\n${rules((selector) => selector)}\n}`,
        ]),
    rules((selector) => `[data-ogsc] ${selector}`, true, campaign),
    rules((selector) => `[data-ogsb] ${selector}`, true, campaign),
  ].join("\n");
}

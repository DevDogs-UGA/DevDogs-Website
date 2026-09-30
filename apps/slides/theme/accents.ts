// DevDogs accent system — shared by every layout and the Accent/Chip components.
// Ported 1:1 from the PPTX deck template (see memory: devdogs-deck-template).
export const ACCENTS = {
  purple: "#C27AFF",
  cyan: "#00D3F2",
  amber: "#FFB900",
  emerald: "#00D492",
  red: "#FF6467",
  // Tailwind sky-400. Not a template accent: it marks Flutter code, beside
  // purple for Next.js (see TRACK_ACCENT in lib/track.ts).
  sky: "#00BCFF",
  // Tailwind rose-400: general slides (agenda, section intros, wrap-up).
  rose: "#FF637E",
  // Tailwind indigo-400: the feature-competition section.
  indigo: "#7C86FF",
} as const;

export type AccentName = keyof typeof ACCENTS;

export const DEFAULT_ACCENT: AccentName = "emerald";

export function accentHex(name?: string | null): string {
  if (name && Object.prototype.hasOwnProperty.call(ACCENTS, name))
    return ACCENTS[name as AccentName];
  return ACCENTS[DEFAULT_ACCENT];
}

// The three greys from the template, each with one job. Support is regular
// body/caption text, secondary is contact-line/footer text, dim is the
// quietest tier (code comments, card headers).
export const GREYS = {
  support: "#A89EA9",
  secondary: "#D7D0D7",
  dim: "#79697B",
} as const;

// Card fill and hairline divider, also from the template.
export const CARD_FILL = "#1D161E";
export const HAIRLINE = "#2A212C";

import { PALETTE } from "@devdogsuga/sdk/brand";

/**
 * Email design tokens.
 *
 * Plain values rather than CSS custom properties: variable support is patchy
 * across clients and absent in Outlook, and a token that resolves to nothing
 * produces an unstyled email rather than a fallback.
 *
 * **One palette, not two.** Client support for `prefers-color-scheme` is
 * partial and Outlook inverts colors on its own regardless, so a dark variant
 * would be honoured by only some clients while the rest invert the light one
 * into something nobody designed. These colors read correctly under both.
 *
 * The neutrals are `@devdogsuga/sdk/brand`'s flat-hex palette (`PALETTE`, the same
 * values the OG cards and the site's `--brand-*` variables carry) rather than
 * a second set of greys: ink is mauve-900, the lightest steps do the borders
 * and canvas, and `cosmic-ink-line` draws the outlines the redesigned site uses
 * on cards and buttons. Only the accent is the email's own, the club's UGA red, which
 * the brand palette does not carry.
 */
export const theme = {
  color: {
    ink: PALETTE["mauve-900"],
    muted: PALETTE["mauve-600"],
    line: PALETTE["mauve-200"],
    /** The Cosmic outline: the near-black every card and button edge is drawn in. */
    outline: PALETTE["cosmic-ink-line"],
    surface: PALETTE.white,
    canvas: PALETTE["mauve-100"],
    /** UGA arch black on red. The club's marks, not the university's. */
    accent: "#ba0c2f",
    accentInk: PALETTE.white,
  },
  font: {
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  size: {
    body: "16px",
    small: "14px",
    heading: "22px",
  },
  space: {
    gutter: "24px",
    block: "16px",
  },
  /** Cosmic corners are stepped pixels on the site; email gets a small square radius, the nearest thing every client draws. */
  radius: "4px",
  /** The outline weight, the site's two-pixel cell. */
  border: "2px",
  maxWidth: "560px",
} as const;

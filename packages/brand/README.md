# @devdogsuga/brand

The club's brand tokens: palette, contact/social copy, embedded fonts, and the
mark/wordmark artwork.

Extracted from `@devdogsuga/og`, which keeps the Satori templates that render
them. This package is deliberately a **token slice** — no templates, no
primitives, no Satori-facing layout code, no `react`. A consumer that only
wants the club's colours or marks should not have to pull in a renderer to get
them.

## Entry points

| Import                    | Holds                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@devdogsuga/brand`       | Palette (`ACCENT`, `MAUVE`, `THEME`, `WHITE`, `BLOCK_SHADOW`), `CONTACT`, `WORDMARK_METRICS`, `loadFonts`, and the generated artwork assets (`MARK`, `WORDMARK_ON_DARK`, …). |
| `@devdogsuga/brand/event` | The club's timezone and the meeting-to-card formatting.                                                                                                                      |

`./event` is a separate entry point on purpose: it is types plus pure
functions, so anything that a browser bundles can import it without dragging
this package's base64-embedded fonts and artwork along. The root entry
re-exports the event _types_ for convenience, but importing the root pulls the
assets with it.

## Colour

Colours are authored in OKLCH and converted at build time (`src/oklch.ts`), so
the tokens are plain sRGB strings by the time a consumer sees them — usable in
CSS, in email HTML, and in Satori, none of which agree on OKLCH support.

## Relationship to `@devdogsuga/og`

`og` is untouched and still owns rendering. The intended end state is that
`og` consumes `brand` for its tokens rather than defining its own; until that
cutover lands, `og` remains the original and this package is the extracted
copy. Changes to a token must be made in both until then.

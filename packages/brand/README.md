# @devdogsuga/brand

The club's brand identity, in one package: palette, contact/social copy,
embedded fonts, the source artwork, the DogDays/DogPack marks, the Satori
templates that draw them (banner, app icon, event and page cards, email
signature), and the renderers and QR generator that turn them into files.

It is what lets the graphics tools run from a published CLI without a
DevDogsUGA checkout, and it is the only place any of this lives.

## Entry points

| Import                          | Holds                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@devdogsuga/brand`             | Palette (`ACCENT`, `MAUVE`, `THEME`, `PALETTE`), `CONTACT`, fonts, artwork assets, `APPS`, `FORMATS`, primitives, the marks as React, and every template. |
| `@devdogsuga/brand/event`       | The club's timezone and the meeting-to-card formatting. Types and pure functions only.                                                                    |
| `@devdogsuga/brand/marks`       | The DogDays/DogPack geometry as data, plus `markSvg`/`markBody` for Vue and plain markup. No React.                                                       |
| `@devdogsuga/brand/palette.css` | The palette as `--brand-*` CSS variables (flat hex, so email-safe).                                                                                       |
| `@devdogsuga/brand/qr`          | The QR generator: `renderQrSvg`, `QR_DEFAULTS`, and `qrRequestSchema`/`resolveQrRequest`, the one options schema the console page and the CLI both parse. |
| `@devdogsuga/brand/render`      | Node renderer: `render(element, {width, height, scale})` through Satori and resvg, and `renderQr(request)` to SVG, PNG, JPG, WebP, AVIF and TIFF.         |
| `@devdogsuga/brand/next`        | The `next/og` helper with the fonts embedded, for Workers: `ogResponse`, `imageResponse`, `pageOgImage`.                                                  |
| `@devdogsuga/brand/artwork/*`   | The source SVGs and PNGs: logos, banners, partner marks.                                                                                                  |

`./event` is a separate entry point on purpose: anything a browser bundles can
import it without dragging in the base64-embedded fonts and artwork the root
carries. `satori`, `@resvg/resvg-js` and `sharp` are optional peers of
`./render`, and `next` of `./next`, so a bundle that never imports them never
pulls them in.

## Generated files

| File                      | How                                                                              |
| ------------------------- | -------------------------------------------------------------------------------- |
| `src/generated/assets.ts` | `codegen`: the logos in `artwork/`, split and embedded. Gitignored, derived.     |
| `src/generated/icons.ts`  | `codegen`: Phosphor bold icon paths. Gitignored, derived.                        |
| `palette.css`             | `codegen`: from `src/brand.ts`. Gitignored, derived.                             |
| `src/generated/fonts.ts`  | `pnpm fetch:fonts`: Google Fonts, committed. Run it by hand when a face changes. |

`codegen` runs by itself before `build`, `typecheck`, `lint` and `test`.

## Colour

Colours are authored in OKLCH and converted at build time (`src/oklch.ts`), so
the tokens are plain sRGB strings by the time a consumer sees them: usable in
CSS, in email HTML, and in Satori, none of which agree on OKLCH support.
`palette.test.ts` checks the transcription against Tailwind's own stylesheet.

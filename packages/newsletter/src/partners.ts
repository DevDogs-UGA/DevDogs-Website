/**
 * Partner logos: the organizations an event is run with, drawn on a hero card
 * in place of its button.
 *
 * Each logo is the partner's own artwork knocked out to one color, because
 * the cards are dark and most corporate marks are built for white. Paths keep
 * the fill the caller's to choose, the same as the social icons; `partnerSvg`
 * wraps them in a standalone `<svg>` for rasterising or a data URI.
 */
import { PALETTE } from "./theme.js";

export interface Partner {
  name: string;
  /** Where the logo links. */
  url: string;
  /** The artwork's own viewBox, `[width, height]`. */
  viewBox: readonly [number, number];
  paths: readonly string[];
}

export const PARTNERS = {
  /** Fast Enterprises, from fastenterprises.com/assets/img/logo.svg. */
  fast: {
    name: "Fast Enterprises",
    url: "https://www.fastenterprises.com/careers/",
    viewBox: [1000, 447],
    paths: [
      "M80.7 433.7H16v-86.4h64.7V363H32.2v20H79v15.2H32.2v19.5h48.5v16zm84.3-86.5h16v86.5h-10l-45.5-58.3v58.2h-16.3v-86.4h13.2l42.3 53.6v-53.6zm65.8 14.8h-27.4v-14.7h71V362h-27.3v71.7H231V362zM361 433.7h-64.6v-86.4H361V363h-48.4v20h46.8v15.2h-46.8v19.5H361v16zm101.7 0h-19.4l-25.2-29h-15.6v29H386v-86.5h41.2c20.4.2 31 13.8 31 28.7 0 11.7-5.3 23.7-21.7 27l26.2 29.5v1.2zm-60.2-71.2V390h24.8c10.4 0 14.8-6.8 14.8-13.7s-4.5-13.8-14.7-13.8h-24.8zm119.9 45.8H498v25.4h-16.3v-86.4h40.7c42.2 0 42.3 61 0 61zm-24.4-15h24.4c21 0 20.7-30.5 0-30.5H498v30.6zm156 40.4h-19.4l-25.2-29h-15.7v29h-16.3v-86.5h41c20.5.2 31.2 13.8 31.2 28.7 0 11.7-5.4 23.7-21.8 27l26.2 29.5v1.2zm-60.2-71.2V390h24.8c10.4 0 14.8-6.8 14.8-13.7s-4.6-13.8-14.8-13.8h-24.8zm79.4 71.2v-86.4h16.2v86.4h-16.2zm99.5-65.5c-3-5-11-9.6-20.5-9.6-12 0-18 5-18 11.5 0 7.6 9 9.7 19.3 11 18 2.2 34.8 7 34.8 27.5 0 19.2-17 27.5-36.3 27.5-17.6 0-31.2-5.4-37.6-21.2l13.6-7c3.8 9.5 13.8 13.7 24.3 13.7 10.2 0 20-3.6 20-13 0-8-8.6-11.5-20-12.7-17.7-2-34-6.8-34-26.2 0-17.8 17.5-25 33.4-25.2 13.4 0 27.4 3.8 34 17.2l-13 6.6zm105 65.5H813v-86.4h64.7V363h-48.5v20H876v15.2h-46.8v19.5h48.5v16zm80.9-65.5c-3-5-11-9.6-20.5-9.6-12 0-17.8 5-17.8 11.5 0 7.6 9 9.7 19.2 11 18 2.2 34.8 7 34.8 27.5 0 19.2-17 27.5-36.3 27.5-17.7 0-31.3-5.4-37.7-21.2l13.6-7c3.7 9.5 13.7 13.7 24.2 13.7 10.2 0 20-3.6 20-13 0-8-8.6-11.5-20-12.7-17.7-2-34-6.8-34-26.2 0-17.8 17.5-25 33.4-25.2 13.4 0 27.4 3.8 34 17.2l-13 6.6z",
      "M163 195.2h81l19.3-62.5H163v-55h119.7L302 15H86.3v288.5H163M550.3 160c9.4 8 23.5 16.2 42.3 24.8 20.8 9.3 33.6 15.5 38.4 18.5 4.8 3 8.3 6 10.5 9s3.3 6.4 3.3 10.4c0 6.3-2.7 11.5-8 15.5-5.5 4-14 6-25.6 6-13.4 0-28.2-2-44.2-6.4-16-4.3-31.5-10.2-46.4-18l29.2 83.8s40.6 4 59.8 4c23 0 43-4 60.2-11.6 17-7.7 30.2-18.5 39.3-32.4s13.7-29.8 13.7-47.7c0-19.6-4.8-35.7-14.5-48.5-9.7-12.8-27-24.8-51.8-36-17-7.8-63.8-21.4-55.5-48 10.5-34 72.8-8.2 93 1l-18.5-68.2s-14.2-5.4-44-5.4c-34 0-60.5 7.3-79.8 22.2s-29 35.6-29 62.2c0 14.2 2.3 26.5 6.8 37 4.4 10.2 11.4 19.5 20.8 27.5zM760 83.6v220h78v-220h79V15H696l17.8 68.6",
      "M318.8 303.5c10.6-42.2 54-75.4 97.5-92.8l25 92.8h85.3l-35.6-108c33-1.7 61.5 3.4 95 17-35-36.5-73-52.3-108.2-57L431.3 13.8h-104l-94 289.6h85.5zm83.7-144c-25.4 6-43.7 15-50 18l27.3-102 22.7 84z",
    ],
  },
} as const satisfies Record<string, Partner>;

export type PartnerName = keyof typeof PARTNERS;

export const PARTNER_NAMES = Object.keys(PARTNERS) as PartnerName[];

/** A standalone `<svg>` of one partner's logo, ready to rasterise or inline. */
export function partnerSvg(
  name: PartnerName,
  fill: string = PALETTE.ink,
): string {
  const { viewBox, paths } = PARTNERS[name];
  const d = paths.map((path) => `<path d="${path}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox[0]} ${viewBox[1]}" fill="${fill}">${d}</svg>`;
}

/** The same logo as an `<img>` source for the page render, where SVG is safe. */
export function partnerDataUri(name: PartnerName): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(partnerSvg(name))}`;
}

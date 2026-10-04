import { ImageResponse } from "next/og";
import type { ReactElement } from "react";
import { loadFonts } from "./fonts.js";
import { OG_SIZE } from "./formats.js";
import { PAGE_CARDS, type PageCardCopy } from "./pages.js";
import { PageCard } from "./templates/PageCard.js";

/**
 * The plumbing every `opengraph-image.tsx` in an app shares, with the fonts
 * embedded so it runs in a Cloudflare Worker.
 *
 * ## Why `next/og` and not `@vercel/og`
 *
 * `next/og` is Next's file-convention renderer. vinext shims it with a wrapper
 * around its own pinned `@vercel/og` dependency, and a Vite plugin inlines that
 * package's asset fetches so it runs in the Worker. A directly installed
 * `@vercel/og` would bypass that integration and duplicate the renderer.
 *
 * ## Fonts
 *
 * `loadFonts()` returns faces embedded in the package as base64. Not read from
 * disk (there is none in a Worker) and not fetched (a second network hop, and a
 * second way for a link preview to come back blank).
 */

/** Every card is the same size; social networks want 1.91:1. */
export const size = OG_SIZE;

export const contentType = "image/png";

/**
 * One element as the PNG Next will serve, at whatever size it asks for.
 *
 * The card conventions are all 1.91:1 and go through {@link ogResponse}. The
 * icon conventions are square and two different sizes, so they come here
 * instead of carrying their own copy of the `next/og` reasoning above.
 */
export function imageResponse(
  element: ReactElement,
  dimensions: { width: number; height: number },
): ImageResponse {
  return new ImageResponse(element, { ...dimensions, fonts: loadFonts() });
}

/** Renders one of these cards as the PNG Next will serve. */
export function ogResponse(element: ReactElement): ImageResponse {
  return imageResponse(element, size);
}

/**
 * The whole of a static page's `opengraph-image.tsx`, given its route.
 *
 * The copy comes from `PAGE_CARDS`, keyed by the same route strings
 * `sitemap.ts` publishes, so a page that is in the sitemap has a card and a
 * page that is not does not. Throwing on a missing key is deliberate: the
 * alternative is a card that renders with an empty title, which nothing catches
 * until somebody shares the link.
 */
export function pageOgImage(route: string) {
  const copy: PageCardCopy | undefined = PAGE_CARDS[route];
  if (!copy)
    throw new Error(
      `No Open Graph copy for ${route}. Add it to @devdogsuga/brand's pages.ts.`,
    );

  return {
    alt: `${copy.title} — DevDogs`,
    Image: () => ogResponse(PageCard({ ...size, ...copy })),
  };
}

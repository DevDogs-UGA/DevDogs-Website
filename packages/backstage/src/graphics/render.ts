/**
 * Turning a template into a PNG: `@devdogsuga/brand/render`'s Satori and
 * resvg, the same pair the platform's own link cards go through, so a card
 * exported here and one unfurled from a URL are the same picture.
 *
 * Re-exported rather than called directly so the command and its tests have
 * one seam for the renderer.
 */
export { render, type Rendered } from "@devdogsuga/brand/render";

/**
 * The email's marks as PNG attachments.
 *
 * `@devdogsuga/newsletter` hands over each image as an SVG; a mail client
 * wants a raster. They go through `@devdogsuga/brand/render`, the same Satori
 * and resvg the rest of the club's images use, as an `<img>` of the SVG laid
 * out at the target width. That keeps one rasteriser in the toolchain and
 * keeps the marks vector until the last step: resvg draws the nested SVG at
 * the final size rather than scaling a bitmap.
 */
import { render } from "@devdogsuga/brand/render";
import { createElement } from "react";

/** The SVG's aspect ratio, from its `viewBox` or else its `width` and `height`. */
export function svgAspect(svg: string): number {
  const root = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? "";
  const box = /viewBox\s*=\s*"([^"]+)"/i.exec(root)?.[1];
  const [, , boxWidth, boxHeight] = (box ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (boxWidth && boxHeight) return boxWidth / boxHeight;

  const width = Number(/\bwidth\s*=\s*"([\d.]+)/i.exec(root)?.[1]);
  const height = Number(/\bheight\s*=\s*"([\d.]+)/i.exec(root)?.[1]);
  if (width && height) return width / height;

  throw new Error("The SVG declares neither a viewBox nor a width and height.");
}

/** An SVG as PNG bytes, `width` pixels wide. */
export async function rasterize(svg: string, width: number): Promise<Buffer> {
  const height = Math.max(1, Math.round(width / svgAspect(svg)));
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const { png } = await render(
    createElement("img", { src, width, height, style: { width, height } }),
    { width, height },
  );
  return png;
}

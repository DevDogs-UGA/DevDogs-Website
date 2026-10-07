/**
 * Rasterize newsletter SVGs directly with resvg. Passing them through a nested
 * Satori <img> drops embedded raster photographs inside the SVG.
 */
import { Resvg } from "@resvg/resvg-js";

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
  svgAspect(svg); // Reject invalid sources before handing them to the renderer.
  return Buffer.from(
    new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng(),
  );
}

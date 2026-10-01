/**
 * Turning a template into a PNG, in Node.
 *
 * Two libraries, and the choice of each is load-bearing:
 *
 *   * **Satori** lays the template out and emits SVG. It is the same engine
 *     `next/og` runs inside the platform, so a card exported here and a card
 *     unfurled from a URL are the same picture rather than two implementations
 *     of one design.
 *   * **resvg** rasterises it, for the same reason. The obvious alternative was
 *     sharp, but sharp rasterises through librsvg, and librsvg does not read
 *     `rgba()` in a gradient stop, which is exactly the notation Satori emits:
 *     the background washes came out as flat black. resvg is what `@vercel/og`
 *     itself uses.
 *
 * `@vercel/og` is deliberately NOT used. Its Node build is bundled for a
 * CommonJS loader and wants a global `require`, a `__dirname` and an `hb.wasm`
 * the package does not ship. Driving Satori directly is the same rendering,
 * three hacks fewer.
 *
 * `satori`, `@resvg/resvg-js` and (for the QR formats beyond PNG and SVG)
 * `sharp` are optional peers, imported lazily, so a browser bundle that only
 * wants the templates or `./qr` never pulls a native binary.
 */
import { readFile } from "node:fs/promises";
import type { Resvg as ResvgClass } from "@resvg/resvg-js";
import type satoriFn from "satori";
import type sharpFn from "sharp";
import type { ReactElement } from "react";
import { loadFonts } from "./fonts.js";
import {
  contrastingBackground,
  QR_LOGO_PRESETS,
  renderQrSvg,
  resolveQrRequest,
  type QrFormat,
  type QrLogoPreset,
  type QrRequest,
} from "./qr.js";

export interface RenderOptions {
  /** The layout's own width. Every size in the template is against this. */
  width: number;
  height: number;
  /**
   * Output pixels per layout pixel. The layout is computed once at `width` and
   * the vector result is rasterised larger, so 3x is genuinely three times the
   * detail rather than an upscaled 1x, and the type stays on the same metrics
   * at every scale.
   */
  scale?: number;
}

export interface Rendered {
  png: Buffer;
  svg: string;
  width: number;
  height: number;
}

type Optional = "satori" | "@resvg/resvg-js" | "sharp";

/** An optional peer, with an error that says which one to install. */
async function peer<T>(name: Optional): Promise<T> {
  try {
    return (await import(name)) as T;
  } catch (cause) {
    throw new Error(
      `@devdogsuga/brand/render needs the optional dependency "${name}"; install it next to @devdogsuga/brand.`,
      { cause },
    );
  }
}

/** SVG to PNG bytes at `width` pixels wide. */
async function svgToPng(svg: string, width: number): Promise<Buffer> {
  const { Resvg } = await peer<{ Resvg: typeof ResvgClass }>("@resvg/resvg-js");
  return new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    // Satori has already turned every glyph into a path, so resvg never needs
    // to resolve a family. Saying so keeps it from probing the host's fonts,
    // the one thing here that could differ between a laptop and CI.
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
}

/** Lays a template out with the embedded fonts and rasterises it. */
export async function render(
  element: ReactElement,
  { width, height, scale = 1 }: RenderOptions,
): Promise<Rendered> {
  const { default: satori } = await peer<{ default: typeof satoriFn }>(
    "satori",
  );
  const svg = await satori(element, {
    width,
    height,
    fonts: loadFonts().map(({ name, data, weight, style }) => ({
      name,
      data,
      weight,
      style,
    })),
  });
  const pixels = Math.round(width * scale);

  return {
    png: await svgToPng(svg, pixels),
    svg,
    width: pixels,
    height: Math.round(height * scale),
  };
}

/* ------------------------------------------------------------------- QR */

/** A preset logo from `artwork/`, as the data URI `renderQrSvg` embeds. */
export async function qrLogoHref(preset: QrLogoPreset): Promise<string> {
  const { file, mime } = QR_LOGO_PRESETS[preset];
  // `src/` and `dist/` are both one level under the package root.
  const bytes = await readFile(new URL(`../artwork/${file}`, import.meta.url));
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

export interface QrFile {
  format: QrFormat;
  data: Buffer;
}

/**
 * One QR request as the files the console would download.
 *
 * SVG is the renderer's own output; PNG goes through resvg like everything
 * else here; JPG, WebP, AVIF and TIFF go through sharp. A JPG has no alpha, so
 * with no background set it is flattened onto the colour that contrasts with
 * the ink, as the console does.
 */
export async function renderQr(
  request: QrRequest,
  logoHref?: string,
): Promise<QrFile[]> {
  const { text, options, logo, formats } = resolveQrRequest(request);
  const href =
    logoHref ?? (logo === "none" ? undefined : await qrLogoHref(logo));
  const svg = renderQrSvg(text, options, href);

  const files: QrFile[] = [];
  for (const format of formats) {
    if (format === "svg") {
      files.push({ format, data: Buffer.from(svg) });
      continue;
    }
    const png = await svgToPng(svg, options.size);
    if (format === "png") {
      files.push({ format, data: png });
      continue;
    }
    const { default: sharp } = await peer<{ default: typeof sharpFn }>("sharp");
    let image = sharp(png);
    if (format === "jpg") {
      image = image.flatten({
        background: options.background ?? contrastingBackground(options.color),
      });
    }
    const encoded =
      format === "jpg"
        ? image.jpeg({ quality: 92 })
        : format === "webp"
          ? image.webp()
          : format === "avif"
            ? image.avif()
            : image.tiff();
    files.push({ format, data: await encoded.toBuffer() });
  }
  return files;
}

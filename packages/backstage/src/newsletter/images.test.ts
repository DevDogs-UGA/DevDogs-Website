import { emailImages } from "@devdogsuga/newsletter/export";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { rasterize, svgAspect } from "./images.js";

/** Width and height from a PNG's IHDR chunk. */
function pngSize(png: Buffer): { width: number; height: number } {
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("svgAspect", () => {
  it("reads the viewBox first, then width and height", () => {
    expect(svgAspect('<svg viewBox="0 0 200 50"></svg>')).toBe(4);
    expect(svgAspect('<svg viewBox="0,0,10,10" width="1" height="9"/>')).toBe(
      1,
    );
    expect(svgAspect('<svg width="30" height="10"></svg>')).toBe(3);
  });

  it("refuses an SVG with no size at all", () => {
    expect(() => svgAspect("<svg></svg>")).toThrow("neither a viewBox");
  });
});

describe("rasterize", () => {
  it("preserves raster photographs embedded inside an SVG", async () => {
    const photo = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><image width="20" height="20" href="data:image/png;base64,${photo.toString("base64")}"/></svg>`;
    const pixels = await sharp(await rasterize(svg, 20))
      .ensureAlpha()
      .raw()
      .toBuffer();
    expect([
      ...pixels.subarray((10 * 20 + 10) * 4, (10 * 20 + 10) * 4 + 4),
    ]).toEqual([255, 0, 0, 255]);
  });
  it("draws an SVG at the width asked for, in its own aspect", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><rect width="40" height="20" fill="#f00"/></svg>';
    expect(pngSize(await rasterize(svg, 80))).toEqual({
      width: 80,
      height: 40,
    });
  });

  it("rasterises every image the email references at its declared width", async () => {
    for (const image of emailImages()) {
      const png = await rasterize(image.svg, image.rasterWidth);
      expect(pngSize(png).width, image.filename).toBe(image.rasterWidth);
    }
  });
});

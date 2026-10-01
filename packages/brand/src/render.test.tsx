import { describe, expect, it } from "vitest";
import { FORMATS } from "./formats.js";
import { APPS } from "./apps.js";
import { AppIcon } from "./templates/AppIcon.js";
import { render, renderQr } from "./render.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("render", () => {
  it("rasterises an app icon at its scale", async () => {
    const out = await render(AppIcon({ app: "dogdays", size: 128 }), {
      width: 128,
      height: 128,
      scale: 2,
    });
    expect(out.png.subarray(0, 4)).toEqual(PNG);
    expect(out.width).toBe(256);
    expect(out.svg).toContain(APPS.dogdays.ground.slice(0, 4));
  });

  it("has a format for every card", () => {
    expect(Object.keys(FORMATS).length).toBeGreaterThan(0);
  });
});

describe("renderQr", () => {
  it("defaults to SVG and PNG with the DevDogs logo", async () => {
    const files = await renderQr({ text: "https://devdogsuga.org" });
    expect(files.map((f) => f.format)).toEqual(["svg", "png"]);
    expect(files[0]!.data.toString()).toContain("<image");
    expect(files[1]!.data.subarray(0, 4)).toEqual(PNG);
  });

  it("applies a theme and drops the logo on request", async () => {
    const [svg] = await renderQr({
      text: "x",
      theme: "acm-dark",
      logo: "none",
      formats: ["svg"],
    });
    expect(svg!.data.toString()).not.toContain("<image");
    expect(svg!.data.toString()).toContain('fill="#000000"');
  });

  it("encodes the extra raster formats through sharp", async () => {
    const [jpg] = await renderQr({
      text: "x",
      logo: "none",
      formats: ["jpg"],
    });
    expect(jpg!.data.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  it("rejects an empty request", async () => {
    await expect(renderQr({ text: " " })).rejects.toThrow(
      "Enter something to encode.",
    );
  });
});

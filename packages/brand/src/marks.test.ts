import { describe, expect, it } from "vitest";
import { paletteCss, PALETTE } from "./palette.js";
import { markSvg } from "./marks-data.js";

describe("markSvg", () => {
  it("tints with a colour or leaves currentColor to CSS", () => {
    expect(markSvg("dogpack", { color: "#123456", size: 24 })).toContain(
      'fill="#123456"',
    );
    const css = markSvg("dogdays");
    expect(css).toContain("currentColor");
    expect(css).toContain('viewBox="2.5 3.5 43 43"');
  });
});

describe("palette", () => {
  it("emits every colour as a flat hex CSS variable", () => {
    const css = paletteCss();
    for (const [name, hex] of Object.entries(PALETTE)) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(css).toContain(`: ${hex};`);
      expect(name).toBeTruthy();
    }
    expect(css).toContain("--brand-mauve-950:");
    expect(css).toContain("--brand-red-400:");
  });
});

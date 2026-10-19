import { describe, expect, it } from "vitest";
import { darkModeCss, paintCss } from "./darkmode.js";
import { eventArt, THEMES, themeOf } from "./design.js";
import {
  previewRenderContext,
  pruneUnusedPins,
  renderIssueDocument,
} from "./export/index.js";
import { ISSUES, type ChangelogIssue } from "./issues.js";

const base = ISSUES.find((issue) => issue.version === "3.1.0")!;
const cosmic = renderIssueDocument(base);
const paperIssue: ChangelogIssue = { ...base, theme: "paper" };
const paper = renderIssueDocument(paperIssue);

describe("theme selection", () => {
  it("defaults to Cosmic and takes Paper from issue.theme", () => {
    expect(themeOf(base)).toBe(THEMES.cosmic);
    expect(themeOf(paperIssue)).toBe(THEMES.paper);
    expect(ISSUES.every((issue) => issue.theme === undefined)).toBe(true);
  });
});

describe("Cosmic", () => {
  it("draws the space strip, pixel stairs, glow, sprites and rounded, shadowed frames", () => {
    for (const image of ["cosmic-strip", "cosmic-stairs", "sprite-laptop"]) {
      expect(cosmic).toContain(`cid:theme-${image}@devdogsuga.org`);
    }
    expect(cosmic).toContain("bgi-glow-build");
    expect(cosmic).toContain("border-radius:14px");
    // the hard shadows are inline, so clients that drop <style> keep them
    expect(cosmic).toMatch(/style="[^"]*box-shadow:7px 7px 0 0 #0084d1/);
    expect(cosmic).not.toContain("clip-path");
    expect(cosmic).toContain("text-shadow:3px 3px 0 #0084d1");
    expect(cosmic).toContain("padding:4.5px");
  });

  it("keeps the green masthead and a square, bgcolor-painted base", () => {
    expect(cosmic).toMatch(/color:#34d399">Changelog_/);
    expect(cosmic).toContain('bgcolor="#38bdf8"');
    expect(cosmic).not.toContain("Google Sans");
  });

  it("leaves buttons in their shape and puts no badges over events", () => {
    expect(cosmic).not.toContain("border-radius:20px");
    expect(cosmic).not.toContain("text-transform:uppercase;padding:5px 10px");
    expect(cosmic).toContain("padding:14px 26px");
    expect(cosmic).toContain("border-radius:8px");
  });

  it("keeps the glow image in the stylesheet, never inline", () => {
    expect(cosmic).toMatch(/\.bgi-glow-build\{background-image:url\('https:/);
    expect(cosmic.slice(cosmic.indexOf("<table"))).not.toMatch(
      /style="[^"]*background/,
    );
  });
});

describe("Paper", () => {
  it("is flat: pastel ground, ink outlines, no shadows or pixel frames", () => {
    expect(paper).toContain('bgcolor="#c3ecf6"');
    expect(paper).toContain("border:3px solid #1e1e1e");
    expect(paper).toContain("border:2px solid #1e1e1e");
    const body = paper.slice(paper.indexOf("<body"));
    expect(body).not.toContain("shadow");
    expect(body).not.toContain("px-o");
    // the only box-shadow in the stylesheet is the dark-mode armor
    expect(paper.slice(0, paper.indexOf("<body"))).not.toMatch(
      /drop-shadow|\.px-sh/,
    );
  });

  it("sets Google Sans and Google Sans Mono", () => {
    expect(paper).toContain("'Google Sans Mono'");
    expect(paper).toContain("font-family:'Google Sans'");
    expect(paper).toContain("GoogleSans-Regular.ttf");
    expect(paper).toContain("GoogleSansMono-Regular.ttf");
  });

  it("uses Paper's masthead, button, dots and kind colors", () => {
    expect(paper).toContain("color:#188038");
    expect(paper).toContain('bgcolor="#185abc"');
    expect(paper).toContain("border:1px solid #0e3f8a");
    expect(paper).toContain("border-radius:8px");
    expect(paper).toContain('bgcolor="#ea4335"');
    expect(paper).toContain('bgcolor="#57caff"');
    expect(paper).toContain("theme-emoji-laptop@");
    expect(paper).toContain("theme-paper-asterisk@");
  });

  it("leads the footer with the GDG on Campus lockup, then DevDogs", () => {
    const footer = paper.slice(
      paper.lastIndexOf("theme-paper-gdgc-lockup@") - 50,
    );
    expect(footer.indexOf("theme-paper-gdgc-lockup@")).toBeLessThan(
      footer.indexOf("theme-paper-devdogs-logo@"),
    );
  });

  it("ships a dark twin for the Outlook dark-mode stamps, never a media layer", () => {
    const dark = darkModeCss({ campaign: true, theme: "paper" });
    expect(dark).not.toContain("@media");
    expect(dark).toContain("[data-ogsb] .gdgc-dark{display:block !important}");
    expect(dark).toContain("[data-ogsb] .gdgc-light{display:none !important}");
    // white cards, ink outlines and grey text each get a dark replacement
    expect(dark).toContain("[data-ogsb] .bc-ffffff{background-color:#202124");
    expect(dark).toContain("[data-ogsb] .brc-1e1e1e{border-color:#bdc1c6");
    expect(dark).toContain("[data-ogsc] .tc-5f6368{color:#9aa0a6");
    expect(dark).toContain("[data-ogsb] .bc-c3ecf6{background-color:#12333d");
    expect(paper).toContain("gdgc-dark");
    expect(paper).toContain("theme-paper-gdgc-lockup-dark@");
  });

  it("paints every background through a class with paint and pin rules", () => {
    const paint = paintCss({ campaign: true, theme: "paper" });
    const pins = darkModeCss({ campaign: true, theme: "paper" });
    for (const element of paper.split("<")) {
      const style = /style="([^"]*)"/.exec(element)?.[1];
      if (style && !element.startsWith("body")) {
        expect(style).not.toContain("background");
      }
      for (const cls of (/class="([^"]*)"/.exec(element)?.[1] ?? "").split(
        " ",
      )) {
        if (!cls.startsWith("bc-")) continue;
        expect(paint, cls).toContain(`.${cls}{`);
        expect(pins, cls).toContain(`[data-ogsb] .${cls}{`);
      }
    }
  });

  it("renders a trailing GDGC-style mirror and prompt", () => {
    const gdgc = renderIssueDocument({
      ...paperIssue,
      command: "gdgc --date 2026-10-12",
    });
    expect(gdgc).toContain("curl devdogsuga.org/newsletters/gdgc/3.1.0");
    expect(gdgc).toContain("--date 2026-10-12");
    expect(gdgc).not.toContain("changelog gdgc");
  });
});

describe("event art", () => {
  it("matches the night, then falls back to the kind", () => {
    expect(eventArt("Bug Bash", "build")).toBe("bug");
    expect(eventArt("Merge Monday", "build")).toBe("laptop");
    expect(eventArt("Workshop Wednesday", "workshop")).toBe("light_bulb");
    expect(eventArt("Georgia 311 Kickoff", "study")).toBe("rocket");
    expect(eventArt("Georgia 311 Checkpoint", "build")).toBe("triangular_flag");
    expect(eventArt("Demo Day", "demo")).toBe("trophy");
    expect(eventArt("DevDogs Touch Grass #2", "social")).toBe("deciduous_tree");
    expect(eventArt("Something New", "social")).toBe("party_popper");
  });
});

describe("hosting and weight", () => {
  it("previews can point theme images at a local directory", () => {
    const html = renderIssueDocument(base, previewRenderContext("file:///x"));
    expect(html).toContain("file:///x/cosmic-strip.png");
    expect(html).not.toContain("devdogsuga.org/brand/newsletter/theme");
  });

  it("prunes pins the body does not use and keeps the ones it does", () => {
    const html =
      '<head><style>.bc-aaaaaa{x}\n.bc-bbbbbb{y}\n.bgi-glow-build{z}\n.px-o{k}</style></head><body><td class="bc-aaaaaa">';
    const out = pruneUnusedPins(html);
    expect(out).toContain(".bc-aaaaaa{x}");
    expect(out).not.toContain(".bc-bbbbbb");
    expect(out).not.toContain("bgi-glow-build");
    expect(out).toContain(".px-o{k}");
  });

  it("keeps both themes comfortably under Gmail's ~102KB clip", () => {
    for (const html of [cosmic, paper]) {
      expect(Buffer.byteLength(html)).toBeLessThan(98_000);
    }
  });
});

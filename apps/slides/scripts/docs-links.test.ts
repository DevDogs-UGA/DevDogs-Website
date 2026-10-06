import { describe, expect, it } from "vitest";
import { relativeDocsUrl, rewriteDocsLinks } from "./docs-links.ts";

const TREE = new Set([
  "_shared/getting-started/prerequisites.md",
  "workshops/index.md",
  "workshops/framework-intros/index.md",
  "workshops/framework-intros/nextjs/setup.md",
  "workshops/supabase/nextjs/setup.md",
  "study-group-finder/getting-started/first-contribution.md",
]);
const exists = (path: string) => TREE.has(path);

const at = (file: string, withTree = true) => ({
  file,
  exists: withTree ? exists : undefined,
});

describe("relativeDocsUrl", () => {
  it("sends a getting-started link to the shared file, at each depth", () => {
    const url = "/docs/workshops/getting-started/prerequisites#for-everyone";
    expect(relativeDocsUrl(url, at("workshops/supabase/run-locally.md"))).toBe(
      "../../_shared/getting-started/prerequisites.md#for-everyone",
    );
    expect(
      relativeDocsUrl(url, at("workshops/supabase/nextjs/05-delete.md")),
    ).toBe("../../../_shared/getting-started/prerequisites.md#for-everyone");
    expect(relativeDocsUrl(url, at("workshops/index.md"))).toBe(
      "../_shared/getting-started/prerequisites.md#for-everyone",
    );
  });

  it("links a project's own page with .md and keeps the anchor", () => {
    expect(
      relativeDocsUrl(
        "/docs/workshops/framework-intros/nextjs/setup#top",
        at("workshops/supabase/nextjs/setup.md"),
      ),
    ).toBe("../../framework-intros/nextjs/setup.md#top");
  });

  it("links another project's page", () => {
    expect(
      relativeDocsUrl(
        "/docs/study-group-finder/getting-started/first-contribution",
        at("workshops/framework-intros/flutter/03-guestbook.md"),
      ),
    ).toBe("../../../study-group-finder/getting-started/first-contribution.md");
  });

  it("falls back to a folder's index page", () => {
    expect(
      relativeDocsUrl(
        "/docs/workshops/framework-intros",
        at("workshops/supabase/concepts.md"),
      ),
    ).toBe("../framework-intros/index.md");
  });

  it("pins another project's mounted copy with ?project", () => {
    expect(
      relativeDocsUrl(
        "/docs/platform/getting-started/prerequisites#x",
        at("workshops/index.md"),
      ),
    ).toBe("../_shared/getting-started/prerequisites.md?project=platform#x");
  });

  it("applies the slug rules without a docs tree", () => {
    expect(
      relativeDocsUrl(
        "/docs/workshops/getting-started/running",
        at("workshops/a/b.md", false),
      ),
    ).toBe("../../_shared/getting-started/running.md");
    expect(
      relativeDocsUrl(
        "/docs/workshops/supabase/nextjs/setup",
        at("workshops/a/b.md", false),
      ),
    ).toBe("../supabase/nextjs/setup.md");
  });

  it("throws for a link that matches no page", () => {
    expect(() =>
      relativeDocsUrl("/docs/workshops/nope", at("workshops/index.md")),
    ).toThrow(/matches no page/);
  });

  it("leaves other URLs alone", () => {
    expect(relativeDocsUrl("/docsify", at("workshops/index.md"))).toBe(
      "/docsify",
    );
  });
});

describe("rewriteDocsLinks", () => {
  const context = at("workshops/supabase/nextjs/setup.md");

  it("rewrites inline links and reference definitions", () => {
    const out = rewriteDocsLinks(
      [
        "See [a](/docs/workshops/getting-started/prerequisites#x) and [b](/docs/workshops/framework-intros/nextjs/setup).",
        "",
        "[ref]: /docs/workshops/getting-started/prerequisites",
        "[ext]: https://example.com/docs/x",
      ].join("\n"),
      context,
    );
    expect(out).toBe(
      [
        "See [a](../../../_shared/getting-started/prerequisites.md#x) and [b](../../framework-intros/nextjs/setup.md).",
        "",
        "[ref]: ../../../_shared/getting-started/prerequisites.md",
        "[ext]: https://example.com/docs/x",
      ].join("\n"),
    );
  });

  it("leaves code fences and code spans untouched", () => {
    const source = [
      "```md",
      "[a](/docs/workshops/getting-started/prerequisites)",
      "```",
      "Use `[a](/docs/workshops/getting-started/prerequisites)` as written, or [b](/docs/workshops/getting-started/prerequisites).",
      "~~~",
      "[c](/docs/workshops/nope)",
      "~~~",
    ].join("\n");
    expect(rewriteDocsLinks(source, context)).toBe(
      source.replace(
        "or [b](/docs/workshops/getting-started/prerequisites)",
        "or [b](../../../_shared/getting-started/prerequisites.md)",
      ),
    );
  });
});

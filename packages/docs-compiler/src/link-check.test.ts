import { describe, expect, it } from "vitest";
import { checkLinks } from "./link-check.js";
import type { DocsPage } from "./types.js";

function page(overrides: Partial<DocsPage> = {}): DocsPage {
  return {
    title: "Untitled",
    description: null,
    order: null,
    frontmatter: {},
    headings: [],
    content: "",
    plainText: "",
    project: "platform",
    path: "platform/index",
    section: null,
    mountedFrom: null,
    ...overrides,
  };
}

describe("checkLinks", () => {
  it("passes an absolute /docs/ link that resolves", () => {
    const pages = [
      page({ path: "platform/index", content: "See [setup](/docs/platform/setup)." }),
      page({ path: "platform/setup", title: "Setup" }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("fails an absolute /docs/ link to a page that does not exist", () => {
    const pages = [
      page({ content: "See [setup](/docs/platform/nowhere)." }),
    ];
    const errors = checkLinks(pages);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("platform/nowhere");
  });

  it("fails an absolute link into a project that does not exist", () => {
    const pages = [page({ content: "[x](/docs/not-a-project/setup)" })];
    const errors = checkLinks(pages);
    expect(errors).toHaveLength(1);
  });

  it("resolves a relative .md link against the linking page's own directory", () => {
    const pages = [
      page({
        path: "platform/guides/one",
        content: "[two](./two.md)",
      }),
      page({ path: "platform/guides/two", title: "Two" }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("resolves a relative .md link that climbs a directory", () => {
    const pages = [
      page({ path: "platform/guides/one", content: "[index](../index.md)" }),
      page({ path: "platform/index" }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("fails a relative .md link with no matching page", () => {
    const pages = [
      page({ path: "platform/guides/one", content: "[gone](./gone.md)" }),
    ];
    expect(checkLinks(pages)).toHaveLength(1);
  });

  it("checks an anchor against the target page's own headings", () => {
    const pages = [
      page({ content: "[setup](/docs/platform/setup#install)" }),
      page({
        path: "platform/setup",
        headings: [{ id: "install", title: "Install", depth: 2 }],
      }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("fails an anchor the target page does not declare", () => {
    const pages = [
      page({ content: "[setup](/docs/platform/setup#nope)" }),
      page({
        path: "platform/setup",
        headings: [{ id: "install", title: "Install", depth: 2 }],
      }),
    ];
    const errors = checkLinks(pages);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("nope");
  });

  it("checks a same-page #anchor link", () => {
    const pages = [
      page({
        content: "[jump](#top)",
        headings: [{ id: "top", title: "Top", depth: 1 }],
      }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("fails a same-page #anchor link with no matching heading", () => {
    const pages = [page({ content: "[jump](#nowhere)" })];
    expect(checkLinks(pages)).toHaveLength(1);
  });

  it("ignores external links", () => {
    const pages = [
      page({
        content:
          "[a](https://example.com) [b](mailto:x@example.com) [c](//example.com/x)",
      }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("ignores a link written inside a fenced code sample", () => {
    const pages = [
      page({ content: "```md\n[gone](/docs/platform/nowhere)\n```\n" }),
    ];
    expect(checkLinks(pages)).toEqual([]);
  });

  it("checks a mounted page's relative link once per project it lands in", () => {
    const pages = [
      page({
        path: "platform/getting-started/troubleshooting",
        mountedFrom: "getting-started/troubleshooting",
        content: "[faq](../faq.md)",
      }),
      page({ path: "platform/faq" }),
      page({
        path: "toolkit/getting-started/troubleshooting",
        project: "toolkit",
        mountedFrom: "getting-started/troubleshooting",
        content: "[faq](../faq.md)",
      }),
      // toolkit/faq deliberately missing, so this mount fails independently.
    ];
    const errors = checkLinks(pages);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.file).toBe("_shared/getting-started/troubleshooting.md");
  });
});

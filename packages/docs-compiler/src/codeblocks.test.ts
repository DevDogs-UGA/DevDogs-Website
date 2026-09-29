import { beforeAll, describe, expect, it } from "vitest";
import { renderBody } from "./render.js";
import type { VariantContext } from "./variants.js";

const ctx: VariantContext = {
  project: "workshops",
  projects: ["workshops"],
  os: ["macos", "linux", "wsl"],
  file: "workshops/page.md",
};

// The first render loads Shiki's highlighter, which alone can outlast
// vitest's 5s per-test timeout on a cold CI runner.
beforeAll(async () => {
  await renderBody("", ctx);
}, 60_000);

describe("code block frame", () => {
  it("names the tab after the file, and numbers lines as the file does", async () => {
    const html = await renderBody(
      "```ts file=lib/a.ts lines=7-8,10\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```\n",
      ctx,
    );
    expect(html).toContain('<figure class="docs-code" data-kind="code">');
    expect(html).toContain('<span class="docs-code-tab">lib/a.ts</span>');
    expect([...html.matchAll(/data-line="(\d+)"/g)].map((m) => m[1])).toEqual([
      "7",
      "8",
      "10",
    ]);
    expect(html.match(/data-gap/g)).toHaveLength(1);
    expect(html).toContain("data-copy");
  });

  it("names an untitled block's tab after its language, and counts from 1", async () => {
    const html = await renderBody("```sql\nselect 1;\n```\n", ctx);
    expect(html).toContain('<span class="docs-code-tab">SQL</span>');
    expect(html).toContain('data-line="1"');
  });

  it("refuses a lines= that does not name one number per line", async () => {
    await expect(
      renderBody("```ts lines=1-3\nconst a = 1;\n```\n", ctx),
    ).rejects.toThrow(/names 3 line\(s\) for a block of 1/);
  });

  it("draws a shell block as a terminal whose prompt follows the commands", async () => {
    const html = await renderBody(
      "```bash cwd=~\n# Clone it\ngh repo clone DevDogsUGA/Web-Workshops\ncd Web-Workshops\ngit switch 01-nextjs-intro\npnpm install\n```\n",
      ctx,
    );
    expect(html).toContain('data-kind="terminal"');
    expect(html).not.toContain("data-line");
    expect(html).toContain("docs-shell-comment");
    const prompts = [
      ...html.matchAll(
        /<span class="docs-prompt-cwd">([^<]*)<\/span>(?:<span class="docs-prompt-git"> ([^<]*)<\/span>)?/g,
      ),
    ].map((m) => `${m[1]}${m[2] ? `@${m[2]}` : ""}`);
    // Four commands, then the idle prompt.
    expect(prompts).toEqual([
      "~",
      "~",
      "~/Web-Workshops@main",
      "~/Web-Workshops@01-nextjs-intro",
      "~/Web-Workshops@01-nextjs-intro",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { checkCommands } from "./command-check.js";
import type { CommandCheckOptions } from "./command-check.js";
import type { DocsPage } from "./types.js";
import type { WorkspacePackage } from "./workspace.js";

function page(overrides: Partial<DocsPage> = {}): DocsPage {
  return {
    title: "Untitled",
    description: null,
    order: null,
    frontmatter: {},
    headings: [],
    content: "",
    plainText: "",
    project: "schedule-builder",
    path: "schedule-builder/setup",
    section: "getting-started",
    mountedFrom: null,
    ...overrides,
  };
}

function pkg(overrides: Partial<WorkspacePackage> = {}): WorkspacePackage {
  return {
    name: "schedule-builder",
    dir: "apps/schedule-builder",
    scripts: new Set(["dev", "build"]),
    ...overrides,
  };
}

function options(overrides: Partial<CommandCheckOptions> = {}): CommandCheckOptions {
  const scheduleBuilder = pkg();
  return {
    devtoolsCommands: new Set(["db", "db migration", "db migration new"]),
    packages: [scheduleBuilder],
    appBySlug: new Map([["schedule-builder", scheduleBuilder]]),
    rootPackage: pkg({ name: "devdogsuga", dir: ".", scripts: new Set(["lint"]) }),
    ...overrides,
  };
}

function fence(lang: string, body: string, meta = ""): string {
  const info = meta === "" ? lang : `${lang} ${meta}`;
  return `\`\`\`${info}\n${body}\n\`\`\`\n`;
}

describe("checkCommands", () => {
  it("passes a real devtools command", () => {
    const pages = [page({ content: fence("sh", "pnpm devtools db migration new") })];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("fails a devtools command that does not exist", () => {
    const pages = [page({ content: fence("sh", "pnpm devtools db reset --hard") })];
    const errors = checkCommands(pages, options());
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("db reset");
  });

  it("skips devtools validation when the catalog could not be loaded", () => {
    const pages = [page({ content: fence("sh", "pnpm devtools anything at all") })];
    expect(checkCommands(pages, options({ devtoolsCommands: null }))).toEqual([]);
  });

  it("passes a --filter command with a real script", () => {
    const pages = [
      page({ content: fence("bash", "pnpm --filter schedule-builder build") }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("fails --filter naming an unknown package", () => {
    const pages = [
      page({ content: fence("bash", "pnpm --filter nope build") }),
    ];
    const errors = checkCommands(pages, options());
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("nope");
  });

  it("fails --filter naming a script the package does not have", () => {
    const pages = [
      page({ content: fence("bash", "pnpm --filter schedule-builder typecheck") }),
    ];
    const errors = checkCommands(pages, options());
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("typecheck");
  });

  it("accepts the --filter … run <script> spelling", () => {
    const pages = [
      page({ content: fence("bash", "pnpm --filter schedule-builder run build") }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("resolves a bare `pnpm run` against the app the page is about", () => {
    const pages = [page({ content: fence("sh", "pnpm run build") })];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("fails a bare `pnpm run` with a script the app does not have", () => {
    const pages = [page({ content: fence("sh", "pnpm run typecheck") })];
    const errors = checkCommands(pages, options());
    expect(errors).toHaveLength(1);
  });

  it("falls back to the workspace root for a project with no matching app", () => {
    const pages = [
      page({ project: "toolkit", path: "toolkit/ci", content: fence("sh", "pnpm run lint") }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("ignores a command in a fence marked nocheck", () => {
    const pages = [
      page({ content: fence("sh", "pnpm devtools db reset --hard", "nocheck") }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("ignores a command shown in a non-shell fence", () => {
    const pages = [
      page({ content: fence("ts", "// pnpm devtools db reset --hard") }),
    ];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("ignores a line that is not a pnpm invocation", () => {
    const pages = [page({ content: fence("sh", "ls -la") })];
    expect(checkCommands(pages, options())).toEqual([]);
  });

  it("strips a leading shell prompt before checking", () => {
    const pages = [page({ content: fence("console", "$ pnpm devtools db migration new") })];
    expect(checkCommands(pages, options())).toEqual([]);
  });
});

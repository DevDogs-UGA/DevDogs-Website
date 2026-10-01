/**
 * The dispatcher's table and the command tree must name the same commands:
 * a declared command with no handler would be in `--help` and the menu and
 * then answer "Unknown command", and a handler with no declaration would be
 * reachable but undiscoverable.
 */
import { describe, expect, it, vi } from "vitest";
import { catalog } from "./catalog.js";
import { HANDLERS, main } from "./cli.js";

describe("the dispatch table", () => {
  it("has a handler for every top-level command in the tree", () => {
    for (const command of catalog.topLevel) {
      expect(HANDLERS[command.name], command.name).toBeTypeOf("function");
    }
  });

  it("has no handler the tree does not declare", () => {
    const declared = new Set(catalog.topLevel.map((command) => command.name));
    for (const name of Object.keys(HANDLERS)) {
      expect(declared.has(name), name).toBe(true);
    }
  });
});

describe("--help --json", () => {
  it("prints every command path, deprecated ones marked", async () => {
    const chunks: string[] = [];
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => {
        chunks.push(String(chunk));
        return true;
      });
    try {
      await main(["--help", "--json"]);
    } finally {
      write.mockRestore();
    }

    const doc = JSON.parse(chunks.join("")) as {
      version: string;
      commands: { path: string; surface: string; deprecated?: string }[];
    };
    expect(doc.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(doc.commands.map((c) => c.path).sort()).toEqual(
      catalog
        .allPaths()
        .map((path) => path.join(" "))
        .sort(),
    );

    const byPath = new Map(doc.commands.map((c) => [c.path, c]));
    expect(byPath.get("check migrations")?.surface).toBe("cli-only");
    expect(byPath.get("completions")?.surface).toBe("cli-only");
    expect(byPath.get("db types")?.deprecated).toContain("types:db");
    expect(byPath.get("preset restart-stack")?.surface).toBe("interactive");
    // The CI tree is a separate bin and stays out.
    expect(byPath.has("deploy")).toBe(false);
  });
});

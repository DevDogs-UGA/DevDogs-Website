/**
 * The dispatcher's table and the command tree must name the same commands:
 * a declared command with no handler would be in `--help` and the menu and
 * then answer "Unknown command", and a handler with no declaration would be
 * reachable but undiscoverable.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { dryRunKind, setDryRun } from "@devdogsuga/cli-core/dry-run";
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

describe("--dry-run", () => {
  afterEach(() => setDryRun(false));

  async function stderrOf(argv: string[]): Promise<string> {
    const chunks: string[] = [];
    const write = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk) => {
        chunks.push(String(chunk));
        return true;
      });
    try {
      await main(argv);
    } finally {
      write.mockRestore();
    }
    return chunks.join("");
  }

  it("stops a command that spawns or writes and prints what it would run", async () => {
    setDryRun(true);
    const printed = await stderrOf(["cron", "run", "--app", "platform"]);
    expect(printed).toContain("Would run: devtools cron run --app platform");
  });

  it("says nothing about commands that only read, or that handle the flag", () => {
    for (const path of [
      ["doctor"],
      ["check", "env"],
      ["cron", "list"],
      ["workflows", "list"],
      ["supabase"],
      ["preset", "apply-migrations"],
      ["run", "build"],
      ["images"],
      ["emails"],
    ]) {
      expect(dryRunKind(catalog, path), path.join(" ")).toBeDefined();
    }
  });

  it("stops the commands that write unless they said otherwise", () => {
    for (const path of [
      ["setup"],
      ["oauth"],
      ["cron", "run"],
      ["workflows", "run"],
      ["workflows", "serve"],
      ["env", "pull"],
      ["env", "example"],
      ["db", "start"],
      ["cf", "preview"],
      ["gen", "campus-map"],
      ["grant-root"],
      ["planner", "create"],
    ]) {
      expect(dryRunKind(catalog, path), path.join(" ")).toBeUndefined();
    }
  });
});

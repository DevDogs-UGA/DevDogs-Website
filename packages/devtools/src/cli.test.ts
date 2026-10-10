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
      commands: {
        path: string;
        surface: string;
        deprecated?: string;
        aliases?: string[];
      }[];
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
    expect(byPath.get("run")?.deprecated).toContain("pnpm -r run");
    expect(byPath.has("db types")).toBe(false);
    expect(byPath.get("restart-stack")?.surface).toBe("interactive");
    expect(byPath.get("run")?.surface).toBe("cli-only");
    // Aliases ride on their command, so a docs check holds pages to `jobs`.
    expect(byPath.get("jobs")?.aliases).toEqual(["cron", "workflows"]);
    expect(byPath.has("cron run")).toBe(false);
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
    const printed = await stderrOf(["jobs", "run", "--app", "platform"]);
    expect(printed).toContain("Would run: devtools jobs run --app platform");
  });

  it("prints a typed alias as the command it stands for", async () => {
    setDryRun(true);
    const printed = await stderrOf(["cron", "run", "--app", "platform"]);
    expect(printed).toContain(
      "Would run: devtools jobs run --app platform --kind sync",
    );
  });

  it("says nothing about commands that only read, or that handle the flag", () => {
    for (const path of [
      ["doctor"],
      ["check", "env"],
      ["jobs", "list"],
      ["supabase"],
      ["apply-migrations"],
      ["restart-stack"],
      ["run", "build"],
      ["roles", "list"],
    ]) {
      expect(dryRunKind(catalog, path), path.join(" ")).toBeDefined();
    }
  });

  it("stops the commands that write unless they said otherwise", () => {
    for (const path of [
      ["setup"],
      ["oauth"],
      ["jobs", "run"],
      ["jobs", "serve"],
      ["env", "pull"],
      ["env", "example"],
      ["roles", "grant"],
      ["roles", "revoke"],
    ]) {
      expect(dryRunKind(catalog, path), path.join(" ")).toBeUndefined();
    }
  });
});

describe("retired names", () => {
  async function refusal(argv: string[]): Promise<string> {
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

  afterEach(() => {
    process.exitCode = undefined;
  });

  it("points `preset <name>` at the command it became", async () => {
    const printed = await refusal(["preset", "push-config", "--yes"]);
    expect(printed).toContain("`preset push-config` is now `push-config`.");
    expect(printed).toContain("try: pnpm devtools push-config --yes");
    expect(process.exitCode).toBe(1);
  });

  it("lists all four for a bare `preset`", async () => {
    const printed = await refusal(["preset"]);
    expect(printed).toContain("`preset` is gone");
    for (const name of [
      "restart-stack",
      "new-migration",
      "apply-migrations",
      "push-config",
    ]) {
      expect(printed).toContain(`try: pnpm devtools ${name}`);
    }
  });
});

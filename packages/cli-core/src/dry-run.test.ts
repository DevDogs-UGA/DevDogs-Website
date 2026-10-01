import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalog } from "./catalog.js";
import {
  dryRunKind,
  isDryRun,
  resolveDryRun,
  setDryRun,
  wouldRunLine,
} from "./dry-run.js";
import { runInGroup } from "./process-group.js";

afterEach(() => setDryRun(false));

describe("resolveDryRun", () => {
  it("is off without the flag", () => {
    expect(resolveDryRun(["cron", "run"])).toEqual({
      dryRun: false,
      rest: ["cron", "run"],
    });
  });

  it("leaves the flag in place for a command that reads it itself", () => {
    expect(resolveDryRun(["emails", "--dry-run"])).toEqual({
      dryRun: true,
      rest: ["emails", "--dry-run"],
    });
    expect(resolveDryRun(["--dry-run", "cron", "run"])).toEqual({
      dryRun: true,
      rest: ["--dry-run", "cron", "run"],
    });
  });

  it("consumes a leading flag before a passthrough, so the tool never sees it", () => {
    expect(resolveDryRun(["--dry-run", "supabase", "db", "push"])).toEqual({
      dryRun: true,
      rest: ["supabase", "db", "push"],
    });
  });

  it("leaves a flag after the tool name for the tool", () => {
    expect(resolveDryRun(["supabase", "db", "push", "--dry-run"])).toEqual({
      dryRun: false,
      rest: ["supabase", "db", "push", "--dry-run"],
    });
  });

  it("treats run like a passthrough", () => {
    expect(resolveDryRun(["--dry-run", "run", "build"]).rest).toEqual([
      "run",
      "build",
    ]);
    expect(resolveDryRun(["run", "build", "--dry-run"]).dryRun).toBe(false);
  });
});

describe("dryRunKind", () => {
  const catalog = createCatalog({
    usage: "x",
    groups: [
      {
        title: "g",
        commands: [
          {
            name: "cron",
            summary: "s",
            subcommands: [
              { name: "list", summary: "s", dryRun: "read-only" },
              { name: "run", summary: "s" },
            ],
          },
          { name: "doctor", summary: "s", dryRun: "read-only" },
          {
            name: "check",
            summary: "s",
            dryRun: "read-only",
            subcommands: [{ name: "env", summary: "s" }],
          },
        ],
      },
    ],
  });

  it("reads the node's own answer", () => {
    expect(dryRunKind(catalog, ["doctor"])).toBe("read-only");
    expect(dryRunKind(catalog, ["cron", "list"])).toBe("read-only");
  });

  it("is undefined for a command that did not say, so it gets stopped", () => {
    expect(dryRunKind(catalog, ["cron", "run"])).toBeUndefined();
    expect(dryRunKind(catalog, ["cron"])).toBeUndefined();
    expect(dryRunKind(catalog, [])).toBeUndefined();
  });

  it("inherits from the nearest parent that says", () => {
    expect(dryRunKind(catalog, ["check", "env"])).toBe("read-only");
  });
});

describe("a dry run", () => {
  it("prints the command line it stopped", () => {
    expect(wouldRunLine(["cron", "run", "--app", "platform"])).toBe(
      "Would run: devtools cron run --app platform",
    );
  });

  it("makes runInGroup print instead of spawn", async () => {
    setDryRun(true);
    expect(isDryRun()).toBe(true);
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const result = await runInGroup("devtools-no-such-binary", ["--x"]);
    const printed = write.mock.calls.map(([chunk]) => String(chunk)).join("");
    write.mockRestore();
    expect(result).toEqual({ code: 0, signal: null });
    expect(printed).toBe("Would run: devtools-no-such-binary --x\n");
  });
});

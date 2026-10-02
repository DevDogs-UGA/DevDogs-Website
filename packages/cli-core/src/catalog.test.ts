/**
 * Aliases, against a small tree of their own so the claims do not depend on
 * whichever CLI happens to declare one.
 */
import { describe, expect, it } from "vitest";
import { createCatalog, type CommandNode } from "./catalog.js";
import { generateCompletions } from "./completions.js";
import { commandList, renderHelp } from "./help.js";

const jobs: CommandNode = {
  name: "jobs",
  title: "Background jobs",
  summary: "Run or list background jobs.",
  aliases: [
    { name: "cron", implies: ["--kind", "sync"] },
    { name: "workflows", implies: ["--kind", "long-running"] },
  ],
  subcommands: [
    { name: "list", summary: "List them." },
    { name: "run", summary: "Run one." },
  ],
};

const catalog = createCatalog({
  usage: "pnpm devtools",
  groups: [
    {
      title: "Things",
      commands: [{ name: "setup", summary: "Set up." }, jobs],
    },
  ],
});

describe("aliases", () => {
  it("find the command they stand for, at any depth", () => {
    expect(catalog.findCommand(["cron"])).toBe(jobs);
    expect(catalog.findCommand(["workflows", "run"])?.name).toBe("run");
  });

  it("canonicalise a path to the command's own names", () => {
    expect(catalog.canonicalPath(["cron", "run"])).toEqual(["jobs", "run"]);
    expect(catalog.canonicalPath(["jobs"])).toEqual(["jobs"]);
    expect(catalog.canonicalPath(["nope"])).toBeNull();
  });

  it("rewrite an argv and append what the alias implies", () => {
    expect(
      catalog.canonicalArgv(["cron", "run", "--app", "platform", "--yes"]),
    ).toEqual(["jobs", "run", "--app", "platform", "--yes", "--kind", "sync"]);
    // A flag value that happens to spell an alias is not a command token.
    expect(catalog.canonicalArgv(["jobs", "list", "--app", "cron"])).toEqual([
      "jobs",
      "list",
      "--app",
      "cron",
    ]);
    // Leading flags are skipped, values and all.
    expect(catalog.canonicalArgv(["--tier", "staging", "workflows"])).toEqual([
      "--tier",
      "staging",
      "jobs",
      "--kind",
      "long-running",
    ]);
    // The canonical name and an unknown command pass through untouched.
    expect(catalog.canonicalArgv(["jobs", "run"])).toEqual(["jobs", "run"]);
    expect(catalog.canonicalArgv(["bogus"])).toEqual(["bogus"]);
  });

  it("are refused when they collide with another command", () => {
    expect(() =>
      createCatalog({
        usage: "x",
        groups: [
          {
            title: "Clash",
            commands: [
              { name: "cron", summary: "A real cron." },
              { ...jobs, subcommands: [] },
            ],
          },
        ],
      }),
    ).toThrow(/"cron" names two commands/);
  });

  it("render their command's help page, under the command's name", () => {
    const page = renderHelp(catalog, ["cron"]);
    expect(page).toBe(renderHelp(catalog, ["jobs"]));
    expect(page).toContain("pnpm devtools jobs <subcommand>");
    expect(page).toContain(
      "Also typed as cron (jobs … --kind sync), workflows (jobs … --kind long-running).",
    );
  });

  it("sit beside their command in the root help, not as rows of their own", () => {
    const root = renderHelp(catalog);
    expect(root).toContain(
      "Run or list background jobs. (also: cron, workflows)",
    );
    expect(root).not.toMatch(/^\s+cron\s/m);
  });

  it("ride on their command's --help --json entry, not as paths", () => {
    const entries = commandList(catalog);
    expect(entries.map((entry) => entry.path)).not.toContain("cron");
    expect(entries.find((entry) => entry.path === "jobs")?.aliases).toEqual([
      "cron",
      "workflows",
    ]);
  });

  it("complete, after the canonical name, with the command's children", () => {
    const bash = generateCompletions(catalog, "bash");
    expect(bash).toContain(`"") words="setup jobs cron workflows" ;;`);
    expect(bash).toContain(`"cron") words="list run" ;;`);
    expect(bash).toContain(`"jobs") words="list run" ;;`);
  });
});

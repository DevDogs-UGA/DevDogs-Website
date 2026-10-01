/**
 * The command tree's style guards, for the officer CLI. The same claims
 * devtools' `catalog.test.ts` makes of its own tree: every command is one line
 * in `--help`, every path renders, and a flag the menu does not ask about is
 * one somebody decided on.
 */
import { describe, expect, it } from "vitest";
import { renderHelp } from "@devdogsuga/cli-core/help";
import { catalog } from "./catalog.js";

const { allPaths, findCommand, subcommandNames } = catalog;

describe("the tree", () => {
  it("is exactly the commands that always need production secrets, plus completions", () => {
    expect(catalog.topLevel.map((node) => node.name)).toEqual([
      "deploy",
      "env",
      "planner",
      "completions",
    ]);
  });

  it("declares the subcommands each group dispatches", () => {
    expect(subcommandNames(["deploy"])).toEqual([
      "platform",
      "schedule-builder",
      "sandbox",
      "write-env",
      "preflight",
      "plan",
      "migrate",
      "smoke",
      "reconcile",
    ]);
    expect(subcommandNames(["env"])).toEqual(["pull", "push", "audit"]);
    expect(subcommandNames(["planner"])).toEqual([
      "status",
      "create",
      "reset-password",
      "drop",
    ]);
  });

  it("has no command for what was folded away", () => {
    for (const path of [
      ["bw"],
      ["deploy", "require-token"],
      ["deploy", "require-planner"],
      ["deploy", "secrets-file"],
      ["deploy", "orphans"],
    ]) {
      expect(findCommand(path), path.join(" ")).toBeNull();
    }
  });

  it("gives every command a one-line summary", () => {
    for (const path of allPaths()) {
      const summary = findCommand(path)!.summary;
      expect(summary, path.join(" ")).not.toBe("");
      expect(summary, path.join(" ")).not.toContain("\n");
    }
  });
});

describe("help", () => {
  it("fits the top level on a screen", () => {
    expect(renderHelp(catalog).split("\n").length).toBeLessThan(40);
  });

  it("renders every path, under the name people type", () => {
    for (const path of allPaths()) {
      const text = renderHelp(catalog, path);
      expect(text, path.join(" ")).toContain(findCommand(path)!.summary);
      expect(text, path.join(" ")).toContain(
        `pnpm backstage ${path.join(" ")}`,
      );
    }
  });

  it("documents --no-env and --tier at the top level", () => {
    const root = renderHelp(catalog);
    expect(root).toContain("--no-env");
    expect(root).toContain("--tier");
  });
});

describe("prompts", () => {
  /**
   * An option with no prompt is one the menu does not ask about on its own
   * screen. Each is asked SOMEWHERE else, or is one of three documented
   * kinds: live data the command asks from (`--target`, `--app`, `--db-url`
   * when it has a prompt of its own), a suppressor (`--yes`), a credential
   * (`--access-token`), or scripting-only (`--json`, `--label`, `--source`,
   * `--dry-run`, `--prune`, `--file`, `--shell` has one).
   */
  it("leaves unasked only the flags something else asks for", () => {
    const allowed = new Set([
      // `pick.ts` asks, ordered least- to most-dangerous.
      "--target",
      // The command asks from the apps in workers.json.
      "--app",
      // Suppresses a prompt; asking in a wizard that IS the prompt is absurd.
      "--yes",
      // A credential: typing it puts it in `ps` and shell history.
      "--access-token",
      // A file path: a text box is a worse version of the default.
      "--file",
      // Scripting-only.
      "--json",
      "--label",
      "--source",
      "--dry-run",
      // The menu offers the prune itself, after showing the audit.
      "--prune",
    ]);
    const unasked = new Set<string>();
    for (const path of allPaths()) {
      for (const option of findCommand(path)!.options ?? []) {
        if (!option.prompt) unasked.add(option.flag);
      }
    }
    expect([...unasked].sort()).toEqual([...allowed].sort());
  });
});

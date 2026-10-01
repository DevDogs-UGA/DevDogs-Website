/**
 * The command tree's own invariants, and the coverage claim that rests on it.
 *
 * The claim: **the wizard reaches every interactive command and option.** It
 * holds because one composed tree, `catalog.ts`, is what the menu
 * walks, `--help` renders, and every dispatcher validates against.
 * This file guards the parts of that which a type cannot: that the names match
 * the ones dispatch actually accepts, that nothing is declared twice, and that
 * a summary stays the one line `--help` prints it as.
 *
 * `cli.ts` is imported only by `cli.test.ts`, which checks its handler table
 against the tree; the hand-list below checks the other direction by name.
 */
import { describe, expect, it } from "vitest";
import {
  SCOPES,
  TIER,
  type CommandNode,
  type Scope,
} from "@devdogsuga/cli-core/catalog";
import { catalog, GROUPS } from "./catalog.js";

const {
  allPaths,
  findCommand,
  subcommandList,
  subcommandNames,
  topLevel: TOP_LEVEL,
} = catalog;

/** Every node in the tree, at any depth. */
function everyNode(): { path: string[]; node: CommandNode }[] {
  return allPaths().map((path) => ({ path, node: findCommand(path)! }));
}

describe("shape", () => {
  it("resolves every path it enumerates", () => {
    for (const path of allPaths()) {
      expect(findCommand(path), path.join(" ")).not.toBeNull();
    }
  });

  it("has no duplicate name at any level", () => {
    const seen = new Set<string>();
    for (const path of allPaths()) {
      const key = path.join(" ");
      expect(seen.has(key), `${key} declared twice`).toBe(false);
      seen.add(key);
    }
  });

  it("gives every command a one-line summary", () => {
    for (const { path, node } of everyNode()) {
      const where = path.join(" ");
      expect(node.summary, where).not.toBe("");
      expect(node.summary, `${where} summary wraps`).not.toContain("\n");
      // `--help` prints these in a two-column block. Past ~62 the second
      // column wraps on an 80-column terminal, which is the shape the old
      // help had and this replaced.
      expect(node.summary.length, `${where} summary too long`).toBeLessThan(63);
    }
  });

  it("gives every option a unique flag and a one-line summary", () => {
    for (const { path, node } of everyNode()) {
      const flags = (node.options ?? []).map((option) => option.flag);
      expect(new Set(flags).size, `${path.join(" ")} repeats a flag`).toBe(
        flags.length,
      );
      for (const option of node.options ?? []) {
        expect(option.summary, `${path.join(" ")} ${option.flag}`).not.toBe("");
        expect(option.summary).not.toContain("\n");
      }
    }
  });

  it("puts every top-level command in exactly one group", () => {
    const counts = new Map<string, number>();
    for (const group of GROUPS) {
      for (const command of group.commands) {
        counts.set(command.name, (counts.get(command.name) ?? 0) + 1);
      }
    }
    for (const [name, count] of counts) expect(count, name).toBe(1);
    expect(counts.size).toBe(TOP_LEVEL.length);
  });
});

describe("prompts", () => {
  /**
   * Yes adds the flag, with no per-option inversion, so every confirm has to
   * be phrased as the flag's own meaning. A message that asks the opposite
   * ("Scan for duplicates?" for `--no-duplicates`) would silently produce the
   * inverse command, which no type catches.
   */
  it("phrases every confirm as a question", () => {
    for (const { path, node } of everyNode()) {
      for (const option of node.options ?? []) {
        if (option.prompt?.kind !== "confirm") continue;
        expect(
          option.prompt.message.endsWith("?"),
          `${path.join(" ")} ${option.flag}`,
        ).toBe(true);
      }
    }
  });

  it("only offers select choices that are a flag or a plain value", () => {
    for (const { path, node } of everyNode()) {
      for (const option of node.options ?? []) {
        if (option.prompt?.kind !== "select") continue;
        expect(option.prompt.choices.length, path.join(" ")).toBeGreaterThan(1);
        for (const choice of option.prompt.choices) {
          // A choice that is a flag stands alone; one that is not becomes the
          // value of this option's flag. A choice like `-x` is neither.
          if (choice.value.startsWith("-")) {
            expect(choice.value.startsWith("--"), choice.value).toBe(true);
          }
        }
      }
    }
  });

  /**
   * An option with no prompt here is one the wizard does not ask about on its
   * own screen. Every entry below is asked SOMEWHERE, or is one of three
   * documented categories:
   *
   *   * **live-data**: the command asks itself from something live (`--app`,
   *     `--user`, `--target`, `--apps`, `--filter`).
   *   * **suppressor**: exists only to suppress a prompt (`--yes`); asking in
   *     a wizard that IS the prompt makes no sense.
   *   * **credential**: carries a secret (`--access-token`); interactive path
   *     resolves it better and typing it makes it visible to shell history.
   *   * **scripting-only**: meaningful only outside a TTY (`--json`); asking
   *     in a wizard produces nothing useful.
   *
   * Pinned as an exact set, not a subset: a new promptless flag is either one
   * of these categories and belongs in the list with a reason, or it is an
   * option that has quietly become unreachable from the menu.
   */
  it("leaves unasked only the flags something else asks for", () => {
    const allowed = new Set([
      // live-data: the command asks from something live
      "--app",
      "--user",
      "--target",
      "--apps",
      // suppressor: exists to suppress a prompt, not to be one
      "--yes",
      // credential: visible in shell history if asked interactively
      "--access-token",
      // file path: a text box is a worse version of the default
      "--file",
      // `run`'s two. The multiselect it opens IS this question, asked against
      // the apps that actually define the task, so a screen asking "which
      // filter?" first would ask it twice and let the answers disagree.
      "--filter",
      "--all",
      // `images`. The formats a graphic can be drawn at depend on WHICH
      // graphic — the matrix is sparse — and its own wizard asks in the same
      // order as the CLI: positional graphic, format, then output. The outer
      // wizard dispatches bare `images`; these remain available to scripts and
      // in help without duplicating or reordering that flow.
      "--format",
      "--all-formats",
      "--out",
      "--default-out",
      "--dry-run",
      // `emails` asks these after its template picker so the interactive and
      // scripted paths share one flow.
      "--format",
      "--out",
      // scripting-only: machine-readable output; a wizard asking for JSON
      // mode produces nothing useful since the wizard itself is the UI.
      "--json",
      // Live/config-derived selectors and scripting inputs. The cron and
      // Workflow commands ask from Wrangler data when these are absent.
      "--tier",
      "--cron",
      "--workflow",
      "--params",
      "--port",
      // GitHub org/repo/App-slug scoping (`github rulesets`/`github
      // settings`). All three default to the one repository (and App) this
      // reconciler manages; a wizard question for values that are wrong
      // roughly never is a worse version of just editing the flag on the
      // rare drill (a fork, a renamed App) that needs them.
      "--org",
      "--repo",
      "--app-slug",
      // Write gate, not a question: `--apply` toggles "print" to "write" the
      // same way `--dry-run` does elsewhere in this file — the confirmation
      // before writing (`confirmApply`) IS the question, not a second one
      // for whether to ask it.
      "--apply",
      // `oauth`'s connect-transport override (TASK-352). Which transport —
      // the local loopback listener or the device-code flow — is decided
      // automatically from the environment (SSH/Codespaces/dev container,
      // or the loopback listener failing to start), and the wizard already
      // prints which one it picked and why; a prompt here would just ask
      // the same question the auto-detection already answered.
      "--device",
      "--loopback",
      // `oauth`'s endpoint overrides. Every contributor wants the canonical
      // API and platform, so the defaults are preset; these exist only for
      // testing against another project or a platform dev server.
      "--base-url",
      "--platform-url",
      // `doctor --report`: a write-gate for stdout, not a question — same
      // reasoning as `--apply`/`--json` above.
      "--report",
      // `check migrations`: CI names the ref it compared against; the
      // check is typed-only, so there is no wizard to ask.
      "--base",
    ]);
    const unasked = new Set<string>();

    for (const { node } of everyNode()) {
      for (const option of node.options ?? []) {
        if (!option.prompt) unasked.add(option.flag);
      }
    }

    for (const flag of unasked) expect(allowed, flag).toContain(flag);
    // And the other direction: an entry that stops being promptless should
    // leave this list rather than sit in it justifying nothing.
    for (const flag of allowed) expect(unasked, flag).toContain(flag);
  });
});

describe("coverage of what the CLI dispatches", () => {
  /**
   * The top-level names the dispatcher routes on.
   *
   * Hand-written HERE and nowhere else: `dispatch` reaches these through
   * `first === "..."` comparisons, which no import can enumerate. If a command
   * is added to the CLI and not to the tree, this list is where the omission
   * surfaces, and the test below turns it into a failure rather than a command
   * nobody can find in the menu.
   */
  const DISPATCHED = [
    "completions",
    "check",
    "doctor",
    "grant-root",
    "roles",
    "setup",
    "oauth",
    "script",
    "emails",
    "images",
    "env",
    "gen",
    "cron",
    "workflows",
    "github",
    // Both are dispatched twice: once in `main()` ahead of `intro()`, which is
    // what a typed command line reaches, and once in `dispatch` for the walk
    // the wizard hands back. They belong here for the second of those.
    "run",
    "bw",
    "planner",
    // The presets, and the real tools (passthroughs, typed only: `main()`
    // routes them ahead of `intro()`).
    "preset",
    "supabase",
    "wrangler",
    "drizzle-kit",
    "psql",
    // Deprecated aliases for what DevDogsUGA's main still calls, typed only.
    "db",
    "cf",
  ];

  it("declares exactly the top-level commands the CLI accepts", () => {
    expect(new Set(TOP_LEVEL.map((node) => node.name))).toEqual(
      new Set(DISPATCHED),
    );
  });

  it("declares the subcommands each group dispatches", () => {
    expect(subcommandNames(["env"])).toEqual([
      "pull",
      "push",
      "audit",
      "init",
      "example",
      "reset",
    ]);
    expect(subcommandNames(["cron"])).toEqual(["list", "run"]);
    expect(subcommandNames(["workflows"])).toEqual(["list", "run", "serve"]);
    expect(subcommandNames(["check"])).toEqual([
      "migrations",
      "env",
      "workers",
      "scripts",
    ]);
    expect(subcommandNames(["planner"])).toEqual([
      "status",
      "create",
      "reset-password",
      "drop",
    ]);
    expect(subcommandNames(["preset"])).toEqual([
      "restart-stack",
      "new-migration",
      "apply-migrations",
      "push-config",
    ]);

    // The `db` and `cf` namespaces are gone. What is left is the deprecated
    // aliases DevDogsUGA's main still calls.
    expect(subcommandNames(["db"])).toEqual(["start", "types", "introspect"]);
    expect(subcommandNames(["cf"])).toEqual(["preview"]);
    expect(subcommandNames(["gen"])).toEqual(["campus-map"]);
  });

  it("has no command for what was deleted", () => {
    for (const path of [
      ["persona"],
      ["moderation"],
      ["docs"],
      ["db", "reset"],
      ["db", "seed"],
      ["cf", "build"],
      ["cf", "exec"],
      ["gen", "hypno"],
      ["gen", "og-assets"],
      ["gen", "email-templates"],
    ]) {
      expect(findCommand(path), path.join(" ")).toBeNull();
    }
  });

  it("keeps every deprecated command out of the wizard", () => {
    for (const { path, node } of everyNode()) {
      if (!node.deprecated) continue;
      // `run` stays in the menu until the package-script picker replaces its
      // app picker (it is the only way the wizard starts a dev server).
      if (path[0] === "run") continue;
      expect(node.surface, path.join(" ")).toBe("cli-only");
    }
    expect(findCommand(["completions"])?.surface).toBe("cli-only");
  });
});

describe("scopes", () => {
  // Scopes divide the presets' lines now that `db` is gone: the layer each
  // one acts on, so a contributor chooses deliberately rather than by accident.
  const presets = () => findCommand(["preset"])!.subcommands ?? [];

  it("labels every preset", () => {
    for (const command of presets()) {
      expect(command.scope, `preset ${command.name}`).toBeDefined();
    }
  });

  it("labels nothing outside the presets", () => {
    for (const { path, node } of everyNode()) {
      if (path[0] === "preset" && path.length > 1) continue;
      expect(node.scope, path.join(" ")).toBeUndefined();
    }
  });

  /**
   * `--help` opens a heading every time the scope changes as it walks the
   * presets, so scopes that interleaved would render as many one-line blocks
   * rather than readable ones. Declaration order carries that.
   */
  it("declares each scope in one contiguous run", () => {
    const opened = new Set<Scope>();
    let open: Scope | undefined;

    for (const command of presets()) {
      if (!command.scope) continue;
      if (command.scope === open) continue;
      expect(
        opened.has(command.scope),
        `preset ${command.name} reopens ${command.scope}`,
      ).toBe(false);
      opened.add(command.scope);
      open = command.scope;
    }
  });

  it("gives every scope a label for both renderers", () => {
    for (const scope of Object.keys(SCOPES) as Scope[]) {
      expect(SCOPES[scope].menu, scope).not.toBe("");
      expect(SCOPES[scope].help, scope).not.toBe("");
    }
  });
});

describe("subcommandList", () => {
  it("reads as a sentence", () => {
    expect(subcommandList(["cf"])).toBe("preview");
    expect(subcommandList(["planner"])).toBe(
      "status, create, reset-password or drop",
    );
  });

  it("is empty for a leaf", () => {
    expect(subcommandList(["setup"])).toBe("");
  });
});

describe("style guide", () => {
  /**
   * (a) Promptless: scripting-only category — enforced by the "leaves unasked"
   * test above. `--json` joins the allowed set when Phase 7 adds it to commands.
   *
   * (b) No bare --local / --remote / --team as an option flag.
   *
   * The type simplification: one flag (`--target`), one value, no tie-break.
   * DATABASE_TARGET's flag is the descriptor `"--local | --remote"`, not either
   * bare form. This pin keeps that from reverting to two separate boolean flags.
   */
  it("uses no bare --local / --remote / --team flags", () => {
    const banned = new Set(["--local", "--remote", "--team"]);
    for (const { path, node } of everyNode()) {
      for (const option of node.options ?? []) {
        expect(
          banned.has(option.flag),
          `${path.join(" ")} ${option.flag}`,
        ).toBe(false);
      }
    }
  });

  /**
   * (c) `--tier` draws from one closed enum wherever it carries a select prompt.
   *
   * Vacuously true until Phase 3 adds the renamed flag; enforces the set once
   * it does. Each command may offer a subset (staging + production is fine),
   * but no value outside the four may appear.
   */
  it("--tier choices draw from the canonical tier set", () => {
    const TIER_VALUES = new Set([
      "development",
      "preflight",
      "staging",
      "production",
    ]);
    for (const { path, node } of everyNode()) {
      for (const option of node.options ?? []) {
        if (option.flag !== TIER.flag) continue;
        if (option.prompt?.kind !== "select") continue;
        for (const choice of option.prompt.choices) {
          expect(
            TIER_VALUES.has(choice.value),
            `${path.join(" ")} --tier has unknown choice "${choice.value}"`,
          ).toBe(true);
        }
      }
    }
  });

  /**
   * (d) Every command that signals danger declares `--yes`.
   *
   * The signals: ⚠️ in any node text, or one of the verbs erase / delete /
   * rotate in the summary or hint. A command that marks itself as destructive
   * but offers no confirmation-skip is one that scripted callers cannot make
   * non-interactive without hacking the prompt.
   */
  it("declares --yes on every command that signals danger", () => {
    const DANGER = /⚠️|erase|delete|rotate/;
    for (const { path, node } of everyNode()) {
      const text = [node.summary, node.hint ?? ""].join(" ");
      if (!DANGER.test(text)) continue;
      const flags = (node.options ?? []).map((o) => o.flag);
      expect(
        flags,
        `${path.join(" ")} has danger signal but lacks --yes`,
      ).toContain("--yes");
    }
  });

  /**
   * (e) `--dry-run` and `--check` cannot coexist on one command.
   *
   * They are two flavors of "do not write": `--dry-run` always exits 0,
   * `--check` exits 2 on drift. Pairing them leaves the exit code ambiguous.
   * `--no-output` is the older name for `--dry-run`; Phase 5 renames it.
   */
  it("does not declare both --dry-run and --check on one command", () => {
    for (const { path, node } of everyNode()) {
      const flags = new Set((node.options ?? []).map((o) => o.flag));
      expect(
        flags.has("--dry-run") && flags.has("--check"),
        `${path.join(" ")} declares both --dry-run and --check`,
      ).toBe(false);
    }
  });

  it("has no --no-output flags (renamed to --dry-run in Phase 5)", () => {
    for (const { path, node } of everyNode()) {
      for (const option of node.options ?? []) {
        expect(option.flag, path.join(" ")).not.toBe("--no-output");
      }
    }
  });
});

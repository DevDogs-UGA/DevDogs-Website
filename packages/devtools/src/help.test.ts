/**
 * What `--help` prints, and mostly what it does NOT.
 *
 * The help this replaced was 190 lines and printed the whole tree at every
 * level: a contributor asking how to start a database read the Bitwarden
 * target table, the access-token lookup order, `migration_planner`'s grants
 * and the deploy group's wrapper rules on the way past. The assertions below
 * are upper bounds and absence checks, because "concise" and "says no more
 * than it needs to" both fail silently.
 */
import { describe, expect, it } from "vitest";
import { helpPath, renderHelp } from "@devdogsuga/cli-core/help";
import { SCOPES } from "@devdogsuga/cli-core/catalog";
import { catalog } from "./catalog.js";

const { allPaths, findCommand, topLevel: TOP_LEVEL } = catalog;

describe("the top level", () => {
  const root = renderHelp(catalog);

  it("fits on a screen", () => {
    // The old one was 190. A bound rather than a snapshot: this should be free
    // to grow a command without a test edit, and not free to grow a section.
    // Raised from 51 → 62 (Phase 4: Database group) → 68 (Phase 5: planner +
    // signing-key moved to Database/infra scope) → 70 (Phase 7: completions).
    expect(root.split("\n").length).toBeLessThan(70);
  });

  it("names every top-level command", () => {
    for (const node of TOP_LEVEL) {
      expect(root, node.name).toContain(node.name);
    }
  });

  /**
   * The scoped lines are the presets', one level down in `preset --help`, so
   * the root stays a plain list with no scope headings.
   */
  it("renders the presets as a plain root entry without their scopes", () => {
    expect(root).not.toContain(`${SCOPES.repo.help}:`);
    expect(root).toContain("preset");
  });

  /**
   * Each preset names the layer it acts on, and the headings are what stop a
   * short list from making the reader guess which is which.
   */
  it("heads each layer of preset, in scope order", () => {
    const preset = renderHelp(catalog, ["preset"]);
    const repo = preset.indexOf(SCOPES.repo.help);
    const endpoint = preset.indexOf(SCOPES.endpoint.help);

    expect(repo).toBeGreaterThan(-1);
    expect(endpoint).toBeGreaterThan(repo);
  });

  it("marks a deprecated command and says what replaces it", () => {
    expect(renderHelp(catalog, ["db"])).toContain("(deprecated)");
    expect(renderHelp(catalog, ["db", "types"])).toContain(
      "Deprecated. Use `pnpm -F @devdogsuga/supabase types:db`.",
    );
  });

  it("leaves a single-scope group unheaded", () => {
    // Groups that span only one layer should not have a scope heading —
    // every entry would sit under it and the heading adds noise.
    // Structural rather than "contains no colon": a summary may hold one.
    const body = root
      .slice(root.indexOf("\nEnvironment:") + 1)
      .split("\n\n")[0]!
      .split("\n")
      .slice(1);

    expect(body.length).toBeGreaterThan(0);
    for (const line of body) {
      // Two spaces, a name, the gutter, then prose. An entry, not a heading
      // and not a deeper indent.
      expect(line, line).toMatch(/^ {2}\S+ {2,}\S/);
    }
  });

  it("lists no subcommand as an entry of its own", () => {
    // The reason the old help was unreadable: it printed all 31 of them.
    //
    // Structural rather than a substring search: a summary is prose and may
    // contain a subcommand's word ("Report the target's health" holds
    // `status`). What must not appear is a subcommand as a LISTED entry,
    // which is what the reader scans.
    // Two indents or four: a group that splits into scope blocks (Supabase)
    // lists its commands one level deeper, and those are entries too.
    // Matching only ` {2}` would quietly stop guarding them.
    const entries = root
      .split("\n")
      .map((line) => /^ {2,4}(\S+)/.exec(line)?.[1])
      .filter((name): name is string => name !== undefined);

    const topLevel = new Set(TOP_LEVEL.map((node) => node.name));
    const subcommands = new Set(
      allPaths()
        .filter((path) => path.length > 1)
        .map((path) => path[path.length - 1]!)
        .filter((name) => !topLevel.has(name)),
    );

    for (const entry of entries) {
      expect(subcommands, `top-level help lists "${entry}"`).not.toContain(
        entry,
      );
    }
  });

  it("keeps operator internals out", () => {
    // Each of these was in the old top-level help, and none of them is how
    // anyone chooses a command. They are what `docs/` is for. Naming a
    // SYSTEM a command talks to is fine and is how it gets recognised
    // ("synced to Bitwarden and GitHub"); reciting how it authenticates to
    // it, or what a deploy job's environment holds, is not.
    for (const leak of [
      "DEPLOY_ENV",
      "BWS_ACCESS_TOKEN",
      "production-apply",
      "GITHUB_STEP_SUMMARY",
      "--access-token",
      "with-env",
    ]) {
      expect(root, `top-level help leaks "${leak}"`).not.toContain(leak);
    }
  });

  it("says how to go deeper", () => {
    expect(root).toContain("--help");
  });
});

describe("a level down", () => {
  it("lists a group's subcommands and stops", () => {
    const env = renderHelp(catalog, ["env"]);
    expect(env).toContain("pull");
    expect(env).toContain("audit");
    // env's own options belong to its subcommands, not to `env`.
    expect(env).not.toContain("--access-token");
    expect(env.split("\n").length).toBeLessThan(20);
  });

  it("lists a leaf's options and has no subcommand section", () => {
    const pull = renderHelp(catalog, ["env", "pull"]);
    expect(pull).toContain("--target");
    expect(pull).toContain("--access-token");
    expect(pull).not.toContain("Subcommands:");
  });

  it("renders every path in the tree", () => {
    for (const path of allPaths()) {
      const text = renderHelp(catalog, path);
      expect(text, path.join(" ")).toContain(findCommand(path)!.summary);
      expect(text, path.join(" ")).toContain(`pnpm devtools ${path.join(" ")}`);
    }
  });

  it("falls back to the top level for a name that is not a command", () => {
    expect(renderHelp(catalog, ["nonsense"])).toBe(renderHelp(catalog));
  });
});

describe("helpPath", () => {
  it("takes the command names before the first flag", () => {
    expect(helpPath(["env", "pull", "--help"])).toEqual(["env", "pull"]);
    expect(helpPath(["--help"])).toEqual([]);
  });

  it("does not read a flag's value as a command", () => {
    // `--target production --help` must not ask about a command named
    // "production", which would render the top level as if nothing was asked.
    expect(helpPath(["env", "--target", "production", "--help"])).toEqual([
      "env",
    ]);
  });
});

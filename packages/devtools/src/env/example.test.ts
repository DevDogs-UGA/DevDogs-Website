/**
 * What `env init --target <vault target>` is allowed to write.
 *
 * Restored from DevDogsUGA's original `src/env/example.test.ts` (see
 * `../../MOVED-TESTS.md`). Points `DEVTOOLS_TEST_REPO_ROOT` at the committed
 * contract-test fixture (`test/fixture-repo/`, extended with the
 * `demo-registry` package) plus devtools' own always-loaded operator
 * manifest, instead of DevDogsUGA's real ~50-key registry.
 *
 * Most of the original ran generically — `variables()`, `VAULT_TARGETS`,
 * `scoped()`, `mintedKeys()`, `applyOnlyKeys()` — and is restored close to
 * verbatim below, with the fixture's key names substituted for DevDogsUGA's.
 * A few describes were dropped entirely because their WHOLE point was a
 * specific fact about DevDogsUGA's own content, not about this rendering
 * mechanism — left to DevDogsUGA's own `repo-checks` instead (see
 * `../../MOVED-TESTS.md` for the full list and why):
 *
 *   * "drops the values that were wrong for a deployed target" — a named
 *     regression list over specific DevDogsUGA keys (BASE_URL,
 *     GH_APP_PRIVATE_KEY, …) that had a localhost/placeholder default.
 *   * "shrinks preflight WITHOUT shrinking staging or production"'s exact
 *     49/50/1 key counts — restored here as a structural invariant instead
 *     (see the `preflight` describe below).
 *   * "the project picker's rendering" (`APP_SECTIONS` — schedule-builder,
 *     study-group-finder, platform, sandbox) — DevDogsUGA's real app
 *     topology. `resolveSections`'s pure argument-parsing rules (not
 *     registry-dependent) are kept.
 *   * "keeps the development defaults" — DevDogsUGA's specific
 *     localhost/placeholder literals (`http://localhost:3000`, `000000`).
 *
 * ⚠️ EVERYTHING HERE PARSES THE RENDERED TEXT with its own regexes and
 * recomputes the expected key set from raw `variables()` metadata. Reusing
 * `keysRoutedTo()` or `ASSIGNMENT` from the module under test would make most
 * of these tests tautologies: they would agree with the renderer about a shared
 * mistake, which is the exact shape of the bug they exist to catch.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TARGETS,
  VAULT_TARGETS,
  applyOnlyKeys,
  mintedKeys,
  neverStoreKeys,
  variables,
  type VaultTarget,
} from "@devdogsuga/env";
import {
  resetEnvSyncCacheForTests,
  resetPeerCacheForTests,
} from "@devdogsuga/cli-core/repo/peers";
import { resetRepoRootCacheForTests } from "@devdogsuga/cli-core/repo/root";
import { loadRegistry } from "@devdogsuga/cli-core/env/discovery";
import {
  keysForSections,
  renderExample,
  renderInit,
  renderInitAddition,
  resolveSections,
} from "./example.js";

const DATE = "2026-08-16";
const FIXTURE_ROOT = new URL("../../test/fixture-repo/", import.meta.url)
  .pathname;
const previousRoot = process.env.DEVTOOLS_TEST_REPO_ROOT;

beforeAll(async () => {
  process.env.DEVTOOLS_TEST_REPO_ROOT = FIXTURE_ROOT;
  resetRepoRootCacheForTests();
  resetPeerCacheForTests();
  resetEnvSyncCacheForTests();
  await loadRegistry();
});

afterAll(() => {
  if (previousRoot === undefined) delete process.env.DEVTOOLS_TEST_REPO_ROOT;
  else process.env.DEVTOOLS_TEST_REPO_ROOT = previousRoot;
  resetRepoRootCacheForTests();
});

// ── an independent reading of the rendered file ──────────────────────────────

/** `KEY="value"`, active. Its own regex; see the header. */
const ACTIVE = /^([A-Z][A-Z0-9_]*)="(.*)"$/;
/** `# KEY="value"`, the same line commented out. */
const COMMENTED = /^#\s?([A-Z][A-Z0-9_]*)="(.*)"$/;
/** `$NAME` / `${NAME}`, dotenvx's expansion syntax. */
const REFERENCE = /\$\{([A-Z][A-Z0-9_]*)\}|\$([A-Z][A-Z0-9_]*)/g;

interface Parsed {
  /** Assignable lines: key → value, in file order. */
  active: Map<string, string>;
  /** Keys whose only line is commented out. */
  commented: Set<string>;
  /** Section labels, in file order. */
  sections: string[];
  /** Section label → how many assignable lines followed it. */
  assignmentsPerSection: Map<string, number>;
}

function parse(text: string): Parsed {
  const active = new Map<string, string>();
  const commented = new Set<string>();
  const sections: string[] = [];
  const assignmentsPerSection = new Map<string, number>();
  const lines = text.split("\n");

  let section: string | null = null;
  for (const [index, line] of lines.entries()) {
    // A section label is the line between two rules.
    if (
      line.startsWith("# ---") &&
      lines[index + 2]?.startsWith("# ---") === true
    ) {
      section = lines[index + 1]!.slice(2);
      sections.push(section);
      assignmentsPerSection.set(section, 0);
      continue;
    }

    const activeMatch = ACTIVE.exec(line);
    if (activeMatch) {
      active.set(activeMatch[1]!, activeMatch[2]!);
      if (section !== null) {
        assignmentsPerSection.set(
          section,
          assignmentsPerSection.get(section)! + 1,
        );
      }
      continue;
    }
    const commentedMatch = COMMENTED.exec(line);
    if (commentedMatch) commented.add(commentedMatch[1]!);
  }

  return { active, commented, sections, assignmentsPerSection };
}

/** Everything from the first section rule on, with the header dropped. */
function bodyOf(text: string): string {
  return text.slice(text.indexOf("\n# ---------"));
}

function references(value: string): string[] {
  return [...value.matchAll(REFERENCE)].map((m) => (m[1] ?? m[2])!);
}

const target = (name: VaultTarget): Parsed => parse(renderInit(name, DATE));
const development = (): Parsed => parse(renderInit("development", DATE));

/** Every key with a line of any kind, active or commented. */
function mentioned(file: Parsed): Set<string> {
  return new Set([...file.active.keys(), ...file.commented]);
}

// ── an independent reading of the registry ───────────────────────────────────

/**
 * The keys a push for `target` routes, recomputed from the metadata.
 *
 * Deliberately NOT `keysRoutedTo()`: this is the claim that function has to
 * satisfy, written out from the four rules that decide it. "`scope:
 * environment`, storable somewhere, not minted", "apply-tier is production's
 * alone", "plan-tier belongs to the targets whose plan jobs run (preflight and
 * production)", and "a target no app boots from carries only what opted in".
 */
function routedByHand(name: VaultTarget): Set<string> {
  const narrowTarget = !TARGETS[name].deployEnv;
  const keys = new Set<string>();
  for (const [key, entries] of variables()) {
    const storedSomewhere = entries.some(
      (e) =>
        e.meta.scope === "environment" &&
        (e.meta.secrecy === "secret" || e.meta.secrecy === "public") &&
        e.meta.minted !== true,
    );
    const applyOnly = entries.some((e) => e.meta.tier === "apply");
    const planOnly = entries.some((e) => e.meta.tier === "plan");
    const narrowed = entries.every((e) => e.meta.narrowed === true);
    if (narrowTarget && !narrowed) continue;
    if (!storedSomewhere) continue;
    if (applyOnly && name !== "production") continue;
    if (planOnly && name !== "production" && !narrowTarget) continue;
    keys.add(key);
  }
  return keys;
}

const DEPLOYED_VAULT_TARGETS = VAULT_TARGETS.filter(
  (name) => TARGETS[name].deployEnv,
);

/** Keys every one of whose declarations carries `scope`. */
function scoped(scope: string): string[] {
  return [...variables().entries()]
    .filter(([, entries]) => entries.every((e) => e.meta.scope === scope))
    .map(([key]) => key);
}

/** Keys some declaration of which asks to ship commented out. */
function commentedByDeclaration(): string[] {
  return [...variables().entries()]
    .filter(([, entries]) => entries.some((e) => e.meta.commented === true))
    .map(([key]) => key);
}

/** The `example` a key declares, or `""`. */
function declaredExample(key: string): string {
  return variables().get(key)![0]!.meta.example ?? "";
}

// ── the invariant ────────────────────────────────────────────────────────────

describe.each(VAULT_TARGETS)("%s", (name) => {
  it("writes nothing but blanks and derivations this file can expand", () => {
    // THE invariant, and it is mechanical on purpose: no list of keys to keep
    // up to date, so a variable added tomorrow with a localhost default or a
    // `<fill-me>` placeholder fails here rather than in production.
    const { active } = target(name);

    for (const [key, value] of active) {
      if (value === "") continue;

      const refs = references(value);
      expect(
        refs.length,
        `${key}="${value}" is non-empty and derives from nothing — it is a ` +
          "development default or a placeholder, and push would send it",
      ).toBeGreaterThan(0);

      for (const ref of refs) {
        expect(
          active.has(ref),
          `${key} derives from $${ref}, which has no line in this file — ` +
            "the formula cannot expand, so the literal would be pushed",
        ).toBe(true);
      }

      expect(
        value.replaceAll(REFERENCE, ""),
        `${key} carries a fill-me marker outside its references`,
      ).not.toMatch(/[<>]/);
    }
  });

  it("never invents a value", () => {
    // Whatever survives is the declared `example` verbatim.
    const { active } = target(name);
    for (const [key, value] of active) {
      if (value !== "") expect(value).toBe(declaredExample(key));
    }
  });

  it("ships every key it carries uncommented", () => {
    const file = target(name);
    expect([...file.commented]).toEqual([]);
    expect(file.active.size).toBeGreaterThan(0);
  });

  it("carries exactly the keys a push for it routes", () => {
    const file = target(name);
    const expected = routedByHand(name);

    expect(expected.size).toBeGreaterThan(0);
    expect([...file.active.keys()].sort()).toEqual([...expected].sort());
  });

  it("leaves out the committed and per-developer values", () => {
    const file = mentioned(target(name));
    const committed = scoped("default");
    const developer = scoped("developer");

    expect(committed.length).toBeGreaterThan(0);
    expect(developer.length).toBeGreaterThan(0);

    for (const key of [...committed, ...developer]) {
      expect(
        file.has(key),
        `${key} is scope default/developer and has no meaning in ${name}`,
      ).toBe(false);
    }
  });

  it("leaves out the minted and never-store credentials", () => {
    const file = mentioned(target(name));

    expect(mintedKeys().length).toBeGreaterThan(0);
    expect(neverStoreKeys().length).toBeGreaterThan(0);

    for (const key of [...mintedKeys(), ...neverStoreKeys()]) {
      expect(file.has(key), `${key} must have no assignable line`).toBe(false);
    }
  });

  it("prints no section heading over an empty section", () => {
    const file = target(name);
    expect(file.sections.length).toBeGreaterThan(0);
    for (const section of file.sections) {
      expect(file.assignmentsPerSection.get(section), section).toBeGreaterThan(
        0,
      );
    }
  });
});

// ── the deployed targets, whose files are the full form ──────────────────────

describe.each(DEPLOYED_VAULT_TARGETS)("%s", (name) => {
  it("keeps the derivation — the file is not simply blanked", () => {
    const { active } = target(name);
    const derived = [...active].filter(([, value]) => value !== "");

    expect(derived.length).toBeGreaterThanOrEqual(1);
    expect(active.get("DEMO_DERIVED")).toBe("$DEMO_VARIABLE");
  });

  it("uncomments the keys the registry asks to comment out", () => {
    // The `commented: true` decision, asserted rather than described.
    const { active } = target(name);
    const routed = commentedByDeclaration().filter((key) =>
      routedByHand(name).has(key),
    );

    expect(routed.length).toBeGreaterThanOrEqual(1);
    // CLOUDFLARE_API_TOKEN: devtools' own operator manifest, `commented:
    // true` in the development file, still a routed ordinary secret in
    // every deployed target.
    expect(routed).toContain("CLOUDFLARE_API_TOKEN");
    for (const key of routed) {
      expect(active.has(key), `${key} must be assignable in ${name}`).toBe(
        true,
      );
    }
  });
});

describe.each(DEPLOYED_VAULT_TARGETS)("%s additive init", (name) => {
  it("appends a newly declared missing key without changing existing text", () => {
    const complete = renderInit(name, DATE);
    const key = "DEMO_APPLY_ADJACENT";
    const incomplete = complete.replace(new RegExp(`^${key}=.*\\n`, "m"), "");

    const addition = renderInitAddition(name, DATE, incomplete);

    expect(addition?.count).toBe(1);
    expect(addition?.text.startsWith(incomplete)).toBe(true);
    expect(addition?.text.match(new RegExp(`^${key}=`, "gm"))).toHaveLength(1);
    expect(addition?.text).toContain(`for: ${name}`);
  });

  it("preserves a derivation whose dependency was already in the file", () => {
    const complete = renderInit(name, DATE);
    const key = "DEMO_DERIVED";
    const incomplete = complete.replace(new RegExp(`^${key}=.*\\n`, "m"), "");

    const addition = renderInitAddition(name, DATE, incomplete);

    expect(addition?.count).toBe(1);
    expect(addition?.text).toMatch(
      new RegExp(`^${key}="\\$DEMO_VARIABLE"$`, "m"),
    );
  });

  it("treats a commented key as an existing decision", () => {
    const complete = renderInit(name, DATE);
    const key = "DEMO_APPLY_ADJACENT";
    const commented = complete.replace(
      new RegExp(`^${key}=.*$`, "m"),
      `# ${key}=""`,
    );

    expect(renderInitAddition(name, DATE, commented)).toBeNull();
  });
});

// ── the CI-only target, whose file is one line ───────────────────────────────

/**
 * `preflight` renders only the keys that opted in with `narrowed`.
 *
 * The finding this closes: `env init --target preflight` used to write every
 * routable key, and a person who filled that file in and pushed it put
 * write-capable credentials into `preflight`, whose GitHub environment is
 * reachable from `main`.
 */
describe("preflight", () => {
  it("is the target the split is about — not a deploy environment", () => {
    expect(DEPLOYED_VAULT_TARGETS).toEqual(["staging", "production"]);
    expect(VAULT_TARGETS).toContain("preflight");
    expect(TARGETS.preflight.deployEnv).toBe(false);
  });

  it("carries the narrowed keys and nothing else", () => {
    const { active } = target("preflight");
    expect([...active.keys()].sort()).toEqual(["DEMO_NARROWED_SECRET"]);
  });

  it("carries none of the ordinary credentials", () => {
    // BY NAME: ordinary (non-narrowed) secrets must not reach preflight.
    const file = mentioned(target("preflight"));
    for (const key of [
      "DEMO_TOKEN",
      "DEMO_SECOND_TOKEN",
      "DEMO_APPLY_ADJACENT",
    ]) {
      expect(file.has(key), `${key} must not reach preflight`).toBe(false);
      // POSITIVE CONTROL: each really is a key some target carries.
      expect(
        mentioned(target("production")).has(key),
        `${key} is no longer declared under that name`,
      ).toBe(true);
    }
  });

  it("shrinks preflight WITHOUT shrinking staging or production", () => {
    // Structural, not a magic key count — see this file's header for why the
    // original's 49/50/1 pin does not survive the move to a fixture registry.
    const preflight = target("preflight").active.size;
    const staging = target("staging").active.size;
    const production = target("production").active.size;

    expect(preflight).toBeGreaterThan(0);
    expect(preflight).toBeLessThan(staging);
    expect(staging).toBeLessThanOrEqual(production);
  });

  it("says in the file itself why it is short, and that nothing is hand-set", () => {
    const text = renderInit("preflight", DATE);
    expect(text).toContain("PREFLIGHT IS DELIBERATELY TINY");
    expect(text).toMatch(/migrations table/);
    // POSITIVE CONTROL: the key that was always here still renders, so the
    // shortness is the narrowed set being small rather than a generator that
    // stopped emitting.
    expect(text).toMatch(/^DEMO_NARROWED_SECRET=""$/m);
    expect(text).not.toMatch(/^DEMO_TOKEN=/m);
    // And the count in the prose agrees with the body, singular and all.
    expect(text).toContain("The 1 key a");
  });
});

describe("across the targets", () => {
  it("gives production the apply-tier credentials and staging none", () => {
    const apply = applyOnlyKeys();
    expect(apply.length).toBeGreaterThan(0);

    const staging = mentioned(target("staging"));
    const preflight = mentioned(target("preflight"));
    const production = mentioned(target("production"));

    for (const key of apply) {
      expect(staging.has(key), `${key} in .env.staging`).toBe(false);
      expect(preflight.has(key), `${key} in .env.preflight`).toBe(false);
      expect(production.has(key), `${key} in .env.production`).toBe(true);
    }
  });

  it("stops rendering all three targets byte-identically", () => {
    const staging = renderInit("staging", DATE);
    const production = renderInit("production", DATE);
    expect(staging).not.toBe(production);
    expect(bodyOf(staging)).not.toBe(bodyOf(production));
  });
});

// ── the path this change must not touch ──────────────────────────────────────

describe("development", () => {
  it("renders the same body as .env.example", () => {
    // The tightest pin available: `.env.example` is byte-compared in CI
    // (`pnpm devtools env example --check`), so tying the development file to it means
    // any drift in either shows up in one of the two checks.
    expect(bodyOf(renderInit("development", DATE))).toBe(
      bodyOf(renderExample()),
    );
  });

  it("keeps the commented keys commented", () => {
    const file = development();
    const declared = commentedByDeclaration();

    expect(declared.length).toBeGreaterThan(0);
    for (const key of declared) {
      expect(file.commented.has(key), `${key} should stay commented`).toBe(
        true,
      );
      expect(file.active.has(key), `${key} should not be assignable`).toBe(
        false,
      );
    }
  });

  it("keeps every declared key, including the ones no target carries", () => {
    const file = mentioned(development());
    const withoutLines = new Set([...mintedKeys(), ...neverStoreKeys()]);
    for (const key of [
      ...scoped("default"),
      ...scoped("developer"),
      ...applyOnlyKeys(),
    ].filter((key) => !withoutLines.has(key))) {
      expect(file.has(key), `${key} belongs in the development file`).toBe(
        true,
      );
    }
    for (const key of mintedKeys()) {
      expect(file.has(key), `${key} must have no assignable line`).toBe(false);
      expect(renderInit("development", DATE)).toContain(`# ${key}:`);
    }
    const parsed = development();
    for (const key of neverStoreKeys()) {
      expect(parsed.active.has(key), `${key} must not ship active`).toBe(false);
      expect(parsed.commented.has(key), `${key} ships commented`).toBe(true);
    }
  });
});

describe("the project picker's rendering — the parts registry content cannot change", () => {
  // Restored from DevDogsUGA's original "the project picker's rendering"
  // describe. Only the argument-parsing half survives here: `resolveSections`
  // validates against `APP_SECTIONS`, a source-code constant (real app names
  // — schedule-builder, study-group-finder, platform, sandbox), never against
  // the registry, so these three do not need DevDogsUGA's real app sections
  // to exercise. The selection-arithmetic tests that DO need real app
  // sections (`keysForSections` narrowing) are DevDogsUGA repo-checks' job —
  // see this file's header.
  it("resolveSections refuses a section that is not an app or the role", async () => {
    await expect(resolveSections("supabase")).rejects.toThrow(/not a section/);
    await expect(resolveSections("platfrom")).rejects.toThrow(/not a section/);
  });

  it("resolveSections answers everything when nobody can be asked", async () => {
    // vitest has no TTY on stdin, which IS the pipe case.
    expect(await resolveSections()).toBeUndefined();
  });

  it("includes the operator tooling only when the role is picked", () => {
    // "devtools" is a real registry source (devtools' own manifest), not an
    // app section, so this one still exercises real content: picking it
    // pulls in CLOUDFLARE_API_TOKEN; not picking it does not.
    expect(keysForSections(new Set()).has("CLOUDFLARE_API_TOKEN")).toBe(false);
    expect(
      keysForSections(new Set(["devtools"])).has("CLOUDFLARE_API_TOKEN"),
    ).toBe(true);
  });
});

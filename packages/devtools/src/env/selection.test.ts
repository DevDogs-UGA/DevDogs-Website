import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TARGETS,
  narrowedKeys,
  neverStoreKeys,
  variableKeys,
  variables,
} from "@devdogsuga/env";
import {
  resetEnvSyncCacheForTests,
  resetPeerCacheForTests,
} from "../repo/peers.js";
import { resetRepoRootCacheForTests } from "../repo/root.js";
import { loadRegistry } from "./discovery.js";
import { keysRoutedTo, selectForPush } from "./selection.js";

/**
 * The gate on what leaves this machine, and which of the two GitHub stores it
 * leaves for.
 *
 * Restored from DevDogsUGA's original `src/env/selection.test.ts` (see
 * `../../MOVED-TESTS.md`). The original ran against the real DevDogsUGA
 * registry (49/50/1 real declared keys, real derivation formulas like
 * `NEXT_PUBLIC_SUPABASE_URL: "$API_URL"`). This one points
 * `DEVTOOLS_TEST_REPO_ROOT` at the committed contract-test fixture
 * (`test/fixture-repo/`, extended with a `demo-registry` package —
 * `test/fixture-repo/packages/demo-registry/env.ts`) instead, whose keys
 * mirror the SAME classifications (an ordinary secret, a narrowed one, a
 * public per-environment variable, two `localStack` ones, a committed
 * constant, a minted credential, a derived value, an apply-adjacent ordinary
 * secret) under different names — plus devtools' own operator manifest,
 * which `loadRegistry()` now always includes (`env/discovery.ts`'s
 * `ownManifestPath()`), supplying the real `BWS_ACCESS_TOKEN` (never-store)
 * and `SUPABASE_ACCESS_TOKEN` (apply-tier) classifications the original used
 * by name.
 *
 * One assertion from the original does NOT survive here: "leaves staging and
 * production untouched" pinned `keysRoutedTo(...).size` to 49/50/1 — the
 * exact count of DevDogsUGA's OWN declared keys, a fact about that repo's
 * content rather than about devtools' routing mechanism. That belongs to
 * DevDogsUGA's own `repo-checks` (or `env/completeness.test.ts`'s
 * successor there), not here; see `../../MOVED-TESTS.md`.
 *
 * Most tests here are a value that must NOT be uploaded, because that is the
 * direction with no undo: taking a credential back out of Bitwarden and GitHub
 * means rotating it at the issuer and hoping nothing read it in between. The
 * variable half adds a second irreversible direction. A secret sent to the
 * variable store is published in plaintext to everyone who can read the
 * repository's Actions config, so the routing assertions are two-sided
 * throughout: in the store it belongs to, and NOT in the other one.
 */

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

const env = (o: Record<string, string>) => Object.entries(o);

// Literals, not `neverStoreKeys()` / `applyOnlyKeys()`: vitest collects the
// `it` blocks before `beforeAll` runs, when the registry is still empty. The
// completeness test pins both derived sets to exactly these keys, and the
// first test below re-asserts the tie so a drifted literal fails loudly here
// rather than silently testing the wrong key.
const NEVER_STORE = ["BWS_ACCESS_TOKEN"] as const;
const APPLY_ONLY = ["SUPABASE_ACCESS_TOKEN"] as const;

/** The two `localStack: true` fixture values — see `demo-registry/env.ts`. */
const LOCAL_STACK_VARIABLES = ["DEMO_LOCAL_STACK_ONE", "DEMO_LOCAL_STACK_TWO"] as const;

/** Public, `scope: "environment"`, so the variable store. */
const A_VARIABLE = "DEMO_VARIABLE";
/** Public, but `scope: "default"` (committed). Neither store. */
const COMMITTED_PUBLIC = "DEMO_COMMITTED";
/** Public, `scope: "developer"` — devtools' own operator manifest. */
const DEVELOPER_PUBLIC = "DEV_VPN_HOST";

describe("credentials that must never be stored remotely", () => {
  it("tests the same set the registry derives", () => {
    expect(neverStoreKeys()).toEqual([...NEVER_STORE]);
  });

  for (const key of NEVER_STORE) {
    it(`refuses ${key} rather than uploading it, to EITHER store`, () => {
      const { push, variables, refused } = selectForPush(
        env({ [key]: "live-value", DEMO_TOKEN: "x" }),
        "production",
      );
      expect(push.has(key)).toBe(false);
      // The second store is the new way this could go wrong, and it is the
      // worse one: a variable's value is readable by anyone who can see the
      // repository's Actions config.
      expect(variables.has(key)).toBe(false);
      expect(refused).toContain(key);
      // And the rest of the push still goes, so one stray line does not block
      // populating an environment.
      expect(push.get("DEMO_TOKEN")).toBe("x");
    });
  }

  it("refuses BWS_ACCESS_TOKEN in every environment, not just production", () => {
    // It unlocks all three projects, so there is no environment where storing
    // it is less bad than another.
    for (const e of ["preflight", "staging", "production"] as const) {
      const { push, variables } = selectForPush(
        env({ BWS_ACCESS_TOKEN: "0.abc" }),
        e,
      );
      expect(push.size).toBe(0);
      expect(variables.size).toBe(0);
    }
  });

  it("does not report an empty refused key as present", () => {
    // A blank line is a placeholder, not a leak. Warning about it would be
    // noise on a correctly-configured machine.
    const { refused } = selectForPush(env({ BWS_ACCESS_TOKEN: "" }), "staging");
    expect(refused).toEqual([]);
  });
});

describe("apply-only credentials", () => {
  const key = APPLY_ONLY[0];

  it("uploads them for production, where they belong", () => {
    expect(
      selectForPush(env({ [key]: "tok" }), "production").push.has(key),
    ).toBe(true);
  });

  it("skips them everywhere else", () => {
    // They exist to reshape production; a staging copy is a second
    // write-capable token to rotate for no benefit.
    expect(selectForPush(env({ [key]: "tok" }), "staging").push.has(key)).toBe(
      false,
    );
    expect(
      selectForPush(env({ [key]: "tok" }), "preflight").push.has(key),
    ).toBe(false);
  });

  it("does not report them as refused — they are skipped, not dangerous", () => {
    // The two categories have different messages, and conflating them would
    // cry wolf on the ordinary case.
    expect(selectForPush(env({ [key]: "tok" }), "staging").refused).toEqual([]);
  });

  it("does not divert them into the variable store outside production", () => {
    // The way the environment exclusion could now fail OPEN: skipped from the
    // secret store and picked up by the variable one, which would publish a
    // write-capable credential's plaintext to a staging environment.
    for (const e of ["staging", "preflight"] as const) {
      expect(selectForPush(env({ [key]: "tok" }), e).variables.size).toBe(0);
    }
  });
});

describe("public per-environment values — GitHub variables", () => {
  it("tests the same set the registry derives", () => {
    // The literals below are only meaningful while they are still in the
    // derived set. A drifted literal fails here rather than silently testing a
    // key that no longer routes anywhere.
    const derived = new Set(variableKeys());
    for (const key of [A_VARIABLE, ...LOCAL_STACK_VARIABLES]) {
      expect(derived.has(key), `${key} is no longer a variable key`).toBe(true);
    }
    expect(derived.has(COMMITTED_PUBLIC)).toBe(false);
    expect(derived.has(DEVELOPER_PUBLIC)).toBe(false);
  });

  it("routes one to variables and NEVER to secrets", () => {
    const { push, variables } = selectForPush(
      env({ [A_VARIABLE]: "abcdefghijklmnop", DEMO_TOKEN: "s" }),
      "staging",
    );
    expect(variables.get(A_VARIABLE)).toBe("abcdefghijklmnop");
    expect(push.has(A_VARIABLE)).toBe(false);
    // POSITIVE CONTROL: the same call still routes a secret to `push`, so the
    // assertion above is about routing rather than about `selectForPush`
    // having returned two empty maps.
    expect(push.get("DEMO_TOKEN")).toBe("s");
  });

  it("routes the localStack ones to variables anyway", () => {
    // ⚠️ The trap. `localStack: true` means "supplied by `supabase status` in
    // DEVELOPMENT, so absent from .env by design". That is a statement about
    // the local stack, not a reason to withhold a deployed value. Staging and
    // production have no stack to supply these; skipping them makes a deploy
    // point at nothing, and nothing says so.
    for (const environment of ["staging", "production"] as const) {
      const { push, variables } = selectForPush(
        env(
          Object.fromEntries(LOCAL_STACK_VARIABLES.map((k) => [k, `v-${k}`])),
        ),
        environment,
      );
      expect([...variables.keys()].sort()).toEqual(
        [...LOCAL_STACK_VARIABLES].sort(),
      );
      expect(push.size).toBe(0);
    }
  });

  it("sends a committed or per-developer public value NOWHERE", () => {
    // The reason the selector is `scope === "environment"` and not
    // `neverSecretKeys()`. DEMO_COMMITTED is committed and DEV_VPN_HOST is
    // per-developer; a per-environment copy of either is a second source of
    // truth for a value that already has one.
    const { push, variables, refused, unknown } = selectForPush(
      env({
        [COMMITTED_PUBLIC]: "staging",
        [DEVELOPER_PUBLIC]: "10.0.0.1",
        [A_VARIABLE]: "abcdefghijklmnop",
      }),
      "staging",
    );
    expect(push.size).toBe(0);
    // POSITIVE CONTROL: the third key in the same file DID route, so "not in
    // variables" is a decision about scope and not a dead code path.
    expect([...variables.keys()]).toEqual([A_VARIABLE]);
    // And neither is loud: they are ordinary, not dangerous or undeclared.
    expect(refused).toEqual([]);
    expect(unknown).toEqual([]);
  });

  it("skips an empty value in either store", () => {
    // An empty secret reads as "configured" to every consumer that checks for
    // presence, which is worse than an absent one. An empty variable is the
    // same thing one step later: it builds something pointing nowhere.
    const { push, variables } = selectForPush(
      env({ DEMO_TOKEN: "", [A_VARIABLE]: "" }),
      "staging",
    );
    expect(push.size).toBe(0);
    expect(variables.size).toBe(0);
  });

  it("never puts one key in both stores", () => {
    // They would then be sealed into the write-only store AND published in
    // plaintext, which is the worst of the two outcomes and looks like neither.
    const { push, variables } = selectForPush(
      env({
        DEMO_TOKEN: "s",
        DEMO_SECOND_TOKEN: "d",
        [A_VARIABLE]: "abcdefghijklmnop",
      }),
      "staging",
    );
    expect(push.size).toBeGreaterThan(0);
    expect(variables.size).toBeGreaterThan(0);
    for (const key of variables.keys()) expect(push.has(key)).toBe(false);
  });

  it("keeps a minted credential out of both stores", () => {
    // Excluded twice over: `minted` is dropped from `variableKeys()` and from
    // `storableKeys()`. A value found under this name in somebody's .env is a
    // hand-pasted token, and uploading it creates the long-lived copy minting
    // exists to avoid.
    const { push, variables, refused } = selectForPush(
      env({ DEMO_MINTED: "eyJhbGciOi", DEMO_TOKEN: "s" }),
      "production",
    );
    expect(push.has("DEMO_MINTED")).toBe(false);
    expect(variables.has("DEMO_MINTED")).toBe(false);
    // Skipped rather than refused: not pushing one is its ordinary state.
    expect(refused).toEqual([]);
    // POSITIVE CONTROL again: the call did something.
    expect(push.get("DEMO_TOKEN")).toBe("s");
  });
});

describe("keys no manifest declares", () => {
  it("skips them and names them, instead of uploading by omission", () => {
    // The fail-closed rule: undeclared means unclassified, and unclassified
    // values never leave the machine. A typo'd name uploading garbage or a
    // stray local variable uploading something private are both worse than a
    // loud skip.
    const { push, variables, refused, unknown } = selectForPush(
      env({ DEMO_TOKEB: "oops-a-typo", DEMO_TOKEN: "x" }),
      "staging",
    );
    expect(push.has("DEMO_TOKEB")).toBe(false);
    // Undeclared means unclassified, which includes "no idea which GitHub
    // store this belongs in", so it reaches neither.
    expect(variables.has("DEMO_TOKEB")).toBe(false);
    expect(unknown).toEqual(["DEMO_TOKEB"]);
    // Not conflated with the never-store refusals: different message,
    // different fix.
    expect(refused).toEqual([]);
    // And the declared half of the file still pushes.
    expect(push.get("DEMO_TOKEN")).toBe("x");
  });

  it("reports an empty undeclared key too", () => {
    // Unlike an empty declared secret (a placeholder), an empty undeclared
    // key is a declaration problem whatever its value is.
    const { unknown } = selectForPush(env({ MYSTERY_KEY: "" }), "staging");
    expect(unknown).toEqual(["MYSTERY_KEY"]);
  });

  it("declared keys never appear as unknown", () => {
    const { unknown } = selectForPush(
      env({ DEMO_TOKEN: "a", [COMMITTED_PUBLIC]: "staging" }),
      "staging",
    );
    expect(unknown).toEqual([]);
  });
});

describe("a value that is still the declared derivation", () => {
  it("leaves it to the registry instead of storing it", () => {
    // The bug: `env init` writes this line, push stored it verbatim, and a
    // STORED value beats the registry when the deploy composes an env file.
    const { push, variables: vars, derived } = selectForPush(
      env({ DEMO_DERIVED: "$DEMO_VARIABLE", DEMO_TOKEN: "s" }),
      "staging",
    );
    expect(derived).toEqual(["DEMO_DERIVED"]);
    expect(push.has("DEMO_DERIVED")).toBe(false);
    expect(vars.has("DEMO_DERIVED")).toBe(false);
    // POSITIVE CONTROL: the same call still pushed the file's real secret.
    expect(push.get("DEMO_TOKEN")).toBe("s");
  });

  it("is its own outcome, not a silent skip and not a refusal", () => {
    const { derived, refused, unknown } = selectForPush(
      env({ DEMO_DERIVED: "$DEMO_VARIABLE" }),
      "staging",
    );
    expect(derived).toEqual(["DEMO_DERIVED"]);
    expect(refused).toEqual([]);
    expect(unknown).toEqual([]);
  });

  it("PUSHES a value that replaced the derivation", () => {
    // ⚠️ The direction that must not break. Somebody who typed a real value
    // over the formula meant it, and dropping it would upload nothing while
    // reporting success.
    const { variables: vars, derived } = selectForPush(
      env({ DEMO_DERIVED: "https://abcdefghijklmnop.example" }),
      "staging",
    );
    expect(vars.get("DEMO_DERIVED")).toBe("https://abcdefghijklmnop.example");
    expect(derived).toEqual([]);
  });

  it("PUSHES a DIFFERENT derivation", () => {
    // A formula that is not the declared one is deliberate input too. Only
    // exact identity with what the registry declares is "nothing to send".
    const { variables: vars, derived } = selectForPush(
      env({ DEMO_DERIVED: "$DEMO_LOCAL_STACK_ONE" }),
      "staging",
    );
    expect(vars.get("DEMO_DERIVED")).toBe("$DEMO_LOCAL_STACK_ONE");
    expect(derived).toEqual([]);
  });

  it("still counts an empty value as skipped rather than derived", () => {
    const { push, variables: vars, derived } = selectForPush(
      env({ DEMO_DERIVED: "", DEMO_TOKEN: "" }),
      "staging",
    );
    expect(push.size).toBe(0);
    expect(vars.size).toBe(0);
    expect(derived).toEqual([]);
  });

  it("does not let an UNDECLARED key be excused as a derivation", () => {
    const { derived, unknown } = selectForPush(
      env({ MYSTERY_URL: "$DEMO_VARIABLE" }),
      "staging",
    );
    expect(unknown).toEqual(["MYSTERY_URL"]);
    expect(derived).toEqual([]);
  });

  it("does not let a REFUSED key be excused as a derivation", () => {
    const { derived, refused } = selectForPush(
      env({ BWS_ACCESS_TOKEN: "$DEMO_VARIABLE" }),
      "production",
    );
    expect(refused).toEqual(["BWS_ACCESS_TOKEN"]);
    expect(derived).toEqual([]);
  });
});

describe("preflight, the target no app boots from", () => {
  /** The narrowed key, and two ordinary ones that must NOT reach it. */
  const NARROWED_KEY = "DEMO_NARROWED_SECRET";
  const ORDINARY_KEYS = ["DEMO_TOKEN", "DEMO_SECOND_TOKEN"] as const;

  it("derives its narrowness from deployEnv, not from its name", () => {
    // The premise. `preflight` is the only row with `deployEnv: false`, and
    // that is what `ignoredFor()` reads.
    expect(TARGETS.preflight.deployEnv).toBe(false);
    expect(TARGETS.staging.deployEnv).toBe(true);
    expect(TARGETS.production.deployEnv).toBe(true);
  });

  it("routes exactly the keys that opted in", () => {
    expect([...keysRoutedTo("preflight")].sort()).toEqual([NARROWED_KEY]);
    expect(narrowedKeys()).toContain(NARROWED_KEY);
  });

  for (const key of ORDINARY_KEYS) {
    it(`does not route ${key} to preflight`, () => {
      // BY NAME. POSITIVE CONTROL in the same test: each IS routed to
      // staging, so "absent from preflight" is a routing decision and not a
      // key that stopped existing.
      expect(keysRoutedTo("preflight").has(key)).toBe(false);
      expect(keysRoutedTo("staging").has(key)).toBe(true);
    });

    it(`refuses to upload ${key} even when the file holds one`, () => {
      const {
        push,
        variables: vars,
        refused,
      } = selectForPush(
        env({ [key]: "live-value", [NARROWED_KEY]: "narrowed-value" }),
        "preflight",
      );
      expect(push.has(key)).toBe(false);
      expect(vars.has(key)).toBe(false);
      // Skipped rather than refused: `refused` means "must not be stored
      // ANYWHERE", and these belong in staging and production.
      expect(refused).toEqual([]);
      // POSITIVE CONTROL: the narrowed key in the same file did push.
      expect(push.get(NARROWED_KEY)).toBe("narrowed-value");
    });
  }

  it("leaves staging and production at least as large as each other, plus the apply-tier key in production", () => {
    // The shape of the invariant this suite protects, stated structurally
    // rather than as a magic key count (the original DevDogsUGA test pinned
    // `keysRoutedTo(...).size` to 49/50/1 — a fact about THAT repo's
    // declared keys, not about this routing mechanism; see this file's
    // header and `../../MOVED-TESTS.md`).
    const staging = keysRoutedTo("staging");
    const production = keysRoutedTo("production");
    const preflight = keysRoutedTo("preflight");

    // Everything staging routes, production routes too (no key is
    // staging-only in this registry).
    for (const key of staging) expect(production.has(key)).toBe(true);
    // Production routes exactly one more than staging: the apply-tier key.
    expect(production.size - staging.size).toBe(APPLY_ONLY.length);
    for (const key of APPLY_ONLY) {
      expect(staging.has(key)).toBe(false);
      expect(production.has(key)).toBe(true);
    }
    // Preflight is the strict narrow: every preflight key is also in staging
    // and production, and it is a fraction of either.
    for (const key of preflight) {
      expect(staging.has(key)).toBe(true);
      expect(production.has(key)).toBe(true);
    }
    expect(preflight.size).toBeLessThan(staging.size);
  });
});

describe("ordinary secrets", () => {
  it("pushes them, which is the point", () => {
    const { push, refused } = selectForPush(
      env({ DEMO_TOKEN: "a", DEMO_SECOND_TOKEN: "b" }),
      "staging",
    );
    expect([...push.entries()]).toEqual([
      ["DEMO_TOKEN", "a"],
      ["DEMO_SECOND_TOKEN", "b"],
    ]);
    expect(refused).toEqual([]);
  });

  it("preserves a value with characters a naive parser would eat", () => {
    const nasty = "aB3#xY9$k\nline2";
    expect(
      selectForPush(env({ DEMO_TOKEN: nasty }), "staging").push.get(
        "DEMO_TOKEN",
      ),
    ).toBe(nasty);
  });
});

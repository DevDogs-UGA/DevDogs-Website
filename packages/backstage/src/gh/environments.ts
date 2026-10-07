/**
 * The GitHub environments `env push|pull|audit` route to, and which BWS project
 * (if any) backs each.
 *
 * GitHub environments and BWS projects are NOT the same set, and conflating
 * them is the mistake this file exists to prevent. There are FIVE routed
 * GitHub environments fed by THREE BWS projects:
 *
 *   | GitHub environment | BWS project  | Receives                        |
 *   |--------------------|--------------|---------------------------------|
 *   | `preflight`        | `preflight`  | everything EXCEPT apply-tier    |
 *   | `staging`          | `staging`    | everything EXCEPT apply/plan    |
 *   | `staging-build`    | `staging`    | `build: true` keys, VARIABLES   |
 *   | `production`       | `production` | everything, apply-tier included |
 *   | `production-build` | `production` | `build: true` keys, VARIABLES   |
 *
 * ⚠️ THE REVIEWER GATE is `production`'s required reviewers (team `devops`,
 * self-review prevented; see `github/settings/desired.ts`). The invariant is:
 * an environment that receives an apply-tier credential (`tier: "apply"`, today
 * `SUPABASE_ACCESS_TOKEN`, which the deploy's `supabase config push` uses) must
 * be one whose desired settings REQUIRE reviewers. There is no unreviewed
 * production environment any more, so `production` takes the whole project,
 * and `excludeKeys` on `preflight` and `staging` is what keeps a write-capable
 * credential out of environments a push to `main` can reach with nobody in
 * front of it. `environments.test.ts` asserts the invariant against the desired
 * settings rather than restating it.
 *
 * ⚠️ THE BUILD ENVIRONMENTS (`staging-build`, `production-build`) are the
 * opposite: branch `main` plus the merge queue's temporary branches, no
 * reviewers, and VARIABLES ONLY, used to build the deploy artifacts without
 * credentials. They take exactly the keys marked `build: true` in the env
 * manifests (`EnvMeta.build`), pushed from the `staging` / `production`
 * project alongside the environment those keys already go to. `onlyKeys` is
 * what makes that a whitelist, `variablesOnly` keeps a secret out of a store
 * anyone who can read the Actions config can read, and `environments.test.ts`
 * asserts that no `secret` or `never-store` key can route to either.
 *
 * ⚠️ A build key the file holds as its DERIVATION (`API_URL` is
 * `https://$PROJECT_REF.supabase.co`) is not pushed anywhere else, because a
 * stored value beats the registry at deploy time. The build workflow has no
 * registry to expand it, though, so the build environments alone receive the
 * EXPANDED value (`env/derived-build.ts`). That is the one place a computed
 * value is stored, and `audit` expects it there rather than calling it an
 * orphan.
 */
import { assertRegistryLoaded } from "@devdogsuga/cli-core/env/discovery";
import { getEnvSync } from "@devdogsuga/cli-core/repo/peers";

export const GITHUB_ENVIRONMENTS = [
  "preflight",
  "staging",
  "staging-build",
  "production",
  "production-build",
] as const;

export type GithubEnvironment = (typeof GITHUB_ENVIRONMENTS)[number];

export function isGithubEnvironment(v: string): v is GithubEnvironment {
  return (GITHUB_ENVIRONMENTS as readonly string[]).includes(v);
}

export interface GithubEnvironmentSpec {
  /** BWS project to compare against, or null when nothing backs it. */
  bwsProject: string | null;
  /** Deployment branch policy, for the summary line. */
  branch: string;
  /**
   * Keys allowed here, or null for "whatever the file defines".
   *
   * Null on the three deployed environments. The build environments state
   * their list here, DERIVED from `build: true` in the manifests rather than
   * written out, because a short list is exactly what an `excludeKeys` of
   * everything else cannot express.
   */
  onlyKeys: readonly string[] | null;
  /**
   * Takes GitHub VARIABLES and never secrets: the credential-free build
   * environments, whose contents are readable by anyone who can read the
   * repository's Actions config. `pushToGithub` drops every secret bound for
   * one of these, and `onlyKeys` is additionally intersected with the variable
   * set, so neither half alone is what keeps a credential out.
   */
  variablesOnly: boolean;
  /**
   * Keys that must never reach this environment.
   *
   * The reviewer gate's enforcement: `preflight` and `staging` exclude the
   * apply-tier set, so a write-capable credential only lands in the
   * environment that has required reviewers.
   */
  excludeKeys: readonly string[];
  /** Extra confirmation before writing. */
  guarded: boolean;
}

/**
 * The apply-only set, derived from the env manifests (`tier: "apply"` on the
 * declarations in `packages/devtools/env.ts`) rather than listed here.
 *
 * Read at ACCESS time, not module load: this module is imported by the CLI
 * before any manifest is, so a snapshot taken now would be empty, and an empty
 * apply set routes the write-capable credentials to the unreviewed
 * `production` environment, which is the exact failure the split exists to
 * prevent. The guard turns "forgot to loadRegistry()" into a crash instead.
 */
function applyOnly(): readonly string[] {
  assertRegistryLoaded();
  return getEnvSync().applyOnlyKeys();
}

/**
 * The keys the build environments take, derived from `build: true`, same shape
 * and same load-time caveat as `applyOnly()`.
 *
 * Intersected with the variable set. `define()` already refuses `build: true`
 * on anything but a public, environment-scoped key, which is exactly
 * `variableKeys()`; re-checking here means a registry built some other way
 * (a stale published `@devdogsuga/env`, a test fixture) still cannot route a
 * secret into a variables-only environment.
 */
export function buildOnly(): readonly string[] {
  assertRegistryLoaded();
  const env = getEnvSync();
  // A checkout still on an `@devdogsuga/env` from before `build: true` (0.1.8)
  // has no `buildKeys()`, and marks nothing, so it routes nothing.
  if (typeof env.buildKeys !== "function") return [];
  const variables = new Set<string>(env.variableKeys());
  return env.buildKeys().filter((key) => variables.has(key));
}

/**
 * The plan-tier set, same shape and same load-time caveat as `applyOnly()`.
 * Read by the plan jobs in `preflight` and `production`; a copy anywhere else
 * is a credential nothing reads, so `staging` excludes it.
 */
function planOnly(): readonly string[] {
  assertRegistryLoaded();
  return getEnvSync().planOnlyKeys();
}

export const GITHUB_ENVIRONMENT_SPECS: Record<
  GithubEnvironment,
  GithubEnvironmentSpec
> = {
  preflight: {
    bwsProject: "preflight",
    branch: "main",
    onlyKeys: null,
    variablesOnly: false,
    // Reads plan-tier keys (DB_URL, AIRTABLE_PLAN_PAT) but never applies.
    get excludeKeys() {
      return applyOnly();
    },
    guarded: false,
  },
  staging: {
    bwsProject: "staging",
    branch: "main",
    onlyKeys: null,
    variablesOnly: false,
    // Both narrow tiers: no staging job plans, and none may apply.
    get excludeKeys() {
      return [...applyOnly(), ...planOnly()];
    },
    guarded: false,
  },
  // The credential-free build of staging's artifacts: `staging`'s public
  // build-time values, as variables. Listed after `staging` so that
  // `routeTo()`, which takes the first environment accepting a key, still
  // names `staging` as the primary and the audit treats this as the second
  // copy it is.
  "staging-build": {
    bwsProject: "staging",
    branch: "main, merge queue",
    get onlyKeys() {
      return buildOnly();
    },
    variablesOnly: true,
    excludeKeys: [],
    guarded: false,
  },
  // ⚠️ THE REVIEWED ENVIRONMENT: required reviewers gate every job that runs
  // here, so it takes the whole `production` project, apply-tier credential
  // included. Plan-tier keys land here too: the deploy workflow reads DB_URL
  // and AIRTABLE_PLAN_PAT in `production` as well as `preflight`. Loosening
  // `preflight`/`staging` `excludeKeys` is what would break the gate, not
  // anything on this row. `environments.test.ts` asserts that `production` is
  // the only environment accepting an apply-tier key and that the desired
  // settings require reviewers on it.
  production: {
    bwsProject: "production",
    branch: "main",
    onlyKeys: null,
    variablesOnly: false,
    excludeKeys: [],
    guarded: true,
  },
  // Production's build twin. Not `guarded`: it holds public values only, and
  // the confirmation for the `production` environment already names the push
  // as a production write.
  "production-build": {
    bwsProject: "production",
    branch: "main, merge queue",
    get onlyKeys() {
      return buildOnly();
    },
    variablesOnly: true,
    excludeKeys: [],
    guarded: false,
  },
};

// ── Routing ──────────────────────────────────────────────────────────────────
//
// One Bitwarden project can in principle feed more than one GitHub environment
// (production fed two until `production-apply` was removed), so a push still
// asks which key goes where. Derived from the table above rather than written
// out a second time: a hardcoded copy is a copy that can disagree.

/** The GitHub environments fed by one Bitwarden project, in precedence order. */
export function githubTargets(bwsProject: string): GithubEnvironment[] {
  return GITHUB_ENVIRONMENTS.filter(
    (e) => GITHUB_ENVIRONMENT_SPECS[e].bwsProject === bwsProject,
  );
}

/** Whether one environment takes a given key. */
export function accepts(environment: GithubEnvironment, key: string): boolean {
  const spec = GITHUB_ENVIRONMENT_SPECS[environment];
  return spec.onlyKeys
    ? spec.onlyKeys.includes(key)
    : !spec.excludeKeys.includes(key);
}

/**
 * The PRIMARY environment a key belongs in, or `null` for "nowhere here".
 *
 * `null` is not an error. Pushing `staging` with an apply-only credential in
 * the file is the ordinary case: that key belongs to production and has no home
 * in the staging environment.
 *
 * "Primary", not "only": a project may feed several environments, and this
 * returns the first that takes the key. A caller asking "is this copy
 * misplaced?" wants `acceptedBy()` instead.
 */
export function routeTo(
  bwsProject: string,
  key: string,
): GithubEnvironment | null {
  return acceptedBy(bwsProject, key)[0] ?? null;
}

/**
 * EVERY environment of a project that takes a key, in precedence order.
 *
 * The set-shaped question, for callers that compare against what a push
 * actually wrote rather than against one destination. `routeTo()` is this with
 * `[0]` taken; the two only differ for a project feeding several environments,
 * which none does today.
 */
export function acceptedBy(
  bwsProject: string,
  key: string,
): GithubEnvironment[] {
  return githubTargets(bwsProject).filter((e) => accepts(e, key));
}

/**
 * `accepts()` for an environment name that has not been narrowed yet, in the
 * argument order `AuditInput.accepted` wants.
 *
 * Exists so that the predicate `env audit` hands the audit is a NAME rather
 * than a lambda written at the call site: `runEnvAudit` cannot be unit-tested
 * without mocking Bitwarden, GitHub and Cloudflare at once, so anything spelled
 * out there is untested by construction.
 *
 * ⚠️ An unrecognised environment is REFUSED, not accepted. The string comes
 * from whatever `gh` listed, and the audit uses this to decide whether a found
 * copy is a stray. Failing open here would silence the finding for a copy
 * sitting in an environment this repository has never heard of, which is
 * exactly the case worth hearing about.
 */
export function acceptsKey(key: string, environment: string): boolean {
  return isGithubEnvironment(environment) && accepts(environment, key);
}

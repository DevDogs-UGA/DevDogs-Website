/**
 * The expanded values of DERIVED build keys, for the `*-build` environments.
 *
 * `selectForPush()` deliberately sends no derived key anywhere: a file line
 * that is still the declared derivation (`API_URL="https://$PROJECT_REF.supabase.co"`)
 * is a shape, the registry holds it, and a stored copy would BEAT the registry
 * when the deploy composes an env file. The credential-free build workflow
 * (`build-artifacts.yaml`) has no registry and no composer, though: it reads
 * `vars.API_URL` straight off `<tier>-build`, and an unset one built a Worker
 * that failed on its first request. So for a key that is BOTH derived in the
 * file AND `build: true`, the build environment alone gets the computed value.
 *
 * Rule: derived, build-marked, every reference resolvable from the same file.
 * "Derived" covers both shapes a file can take: the line is still the
 * declared formula, or the line is ABSENT and the manifest declares one (the
 * usual case: `.env.staging` has no `API_URL` line at all, only
 * `PROJECT_REF`). A build key the file holds a literal value for is not
 * derived; the ordinary variable push already writes it.
 * `buildOnly()` already intersects `build: true` with the public,
 * environment-scoped variable set, so no secret and no never-store key can be
 * named here, and `pushToGithub` only ever hands these to a `variablesOnly`
 * environment.
 *
 * ⚠️ NOT stored in Bitwarden, and not sent to `staging` or `production`: only
 * the build twin takes a computed value. Widening either reintroduces the
 * stored-beats-registry bug for the runtime environment.
 *
 * ⚠️ An unresolvable reference SKIPS the key (and says so). `expandReferences`
 * turns a missing name into `""`, which would publish `https://.supabase.co`
 * and read as configured to every presence check.
 */
import { getEnvSync } from "@devdogsuga/cli-core/repo/peers";
import { buildOnly } from "../gh/environments.js";

export interface DerivedBuild {
  /** Derived build key to its expanded value. */
  values: Map<string, string>;
  /** Build-marked derivations whose references the file cannot resolve. */
  unresolved: string[];
}

export function derivedBuildValues(
  entries: readonly (readonly [string, string])[],
  derived: readonly string[],
): DerivedBuild {
  const values = new Map<string, string>();
  const unresolved: string[] = [];
  const env = getEnvSync();
  // A checkout whose `@devdogsuga/env` predates the derivation helpers, or
  // `build: true`, has nothing to expand (same tolerance as `buildOnly()`).
  if (
    typeof env.expandReferences !== "function" ||
    typeof env.envReferences !== "function"
  ) {
    return { values, unresolved };
  }

  const raw = new Map(entries);
  const build = new Set(buildOnly());

  // Every transitive reference has a non-empty value in the file.
  const resolvable = (value: string, seen: readonly string[]): boolean =>
    env.envReferences(value).every((name) => {
      if (seen.includes(name)) return false;
      const next = raw.get(name);
      return (
        next !== undefined && next !== "" && resolvable(next, [...seen, name])
      );
    });

  // The manifest's formula for a key the file leaves out. `derivationOf` is
  // as new as `build: true`, so an older `@devdogsuga/env` has none.
  const declared = (key: string): string | undefined => {
    if (typeof env.derivationOf !== "function") return undefined;
    for (const entry of env.variables().get(key) ?? []) {
      const formula = env.derivationOf(entry.meta);
      if (formula !== null) return formula;
    }
    return undefined;
  };

  const candidates = [
    ...derived,
    ...[...build].filter((key) => !raw.has(key) && declared(key) !== undefined),
  ];
  for (const key of candidates) {
    if (!build.has(key)) continue;
    const formula = raw.get(key) ?? declared(key);
    if (formula === undefined || !resolvable(formula, [key])) {
      unresolved.push(key);
      continue;
    }
    values.set(key, env.expandReferences(key, formula, raw, {}));
  }
  return { values, unresolved };
}

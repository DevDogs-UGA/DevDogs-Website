/**
 * The environment an app's Worker runs with, built from the app's own manifest.
 *
 * ONE function serves both consumers, so what `wrangler dev` sees locally and
 * what `wrangler deploy --secrets-file` uploads can't drift apart:
 *
 *   * `"deploy"` — the `--secrets-file` rules. `storableKeys()` intersected with
 *     the keys the app's own manifest declares, plus its public server keys
 *     (a value that was only in the composed `.env` at build time is absent
 *     from the deployed Worker's runtime). Two exclusions follow from the rule
 *     rather than being special cases: `:tooling` sources (declared for the
 *     deploy pipeline, not the Worker; the `:` suffix means the source never
 *     equals the app) and `client: true` keys (inlined into the bundle at build
 *     time). Never-store keys stay out because a Worker secret is a remote
 *     copy, the thing they forbid. A minted secret is reported, not filled: the
 *     caller has no minter, so it decides whether that is fatal.
 *
 *   * `"dev"` — the same app-scoped declarations for a local Worker, without
 *     the storable filter (a local run needs the never-store and client keys
 *     too), minus `DEPLOY_ENV` and `NODE_ENV`. Those two are excluded BY NAME,
 *     not by a registry-meta heuristic: their committed source is
 *     wrangler.jsonc's per-env `vars`, never an env file, and materializing
 *     them lets a stray or empty `.env` value override the tier's wrangler var
 *     (a Workflow isolate read a blank `DEPLOY_ENV` and threw "has no
 *     HYPERDRIVE binding"). A `scope: "default"` + `commented: true` filter was
 *     tried first and is WRONG: it also matches opt-in overrides like
 *     `GITHUB_COMPETITION_REPO` that a contributor sets deliberately.
 *
 * Only keys with a value are returned; an empty string counts as no value in
 * `"deploy"` (sending one would read as "configured" to every presence check),
 * while `"dev"` keeps it, since an empty local override is a real choice.
 */
import { storableKeys, variables, type EnvEntry } from "./define.js";

export type WorkerEnvPurpose = "dev" | "deploy";

/** The slice of the registry this needs; a repo's own copy satisfies it. */
export interface WorkerEnvRegistry {
  variables(): Map<string, EnvEntry[]>;
  storableKeys(): string[];
}

export interface WorkerEnv {
  /** Key to value, in registry order for `"deploy"` and sorted for `"dev"`. */
  env: Record<string, string>;
  /** `"deploy"` only: declared, optional, and without a value. */
  absent: string[];
  /** `"deploy"` only: secret keys with nothing to store them, so unfillable. */
  minted: string[];
}

const WRANGLER_OWNED_KEYS = new Set(["DEPLOY_ENV", "NODE_ENV"]);

export function buildWorkerEnv(
  app: string,
  environment: Readonly<Record<string, string | undefined>>,
  purpose: WorkerEnvPurpose,
  registry: WorkerEnvRegistry = { variables, storableKeys },
): WorkerEnv {
  const env: Record<string, string> = {};
  const absent: string[] = [];
  const minted: string[] = [];
  const storable = new Set(registry.storableKeys());
  const entriesByKey =
    purpose === "dev"
      ? [...registry.variables()].sort(([a], [b]) => (a < b ? -1 : 1))
      : [...registry.variables()];

  for (const [key, entries] of entriesByKey) {
    if (purpose === "dev") {
      if (!entries.some((e) => e.source === app)) continue;
      if (WRANGLER_OWNED_KEYS.has(key)) continue;
      const value = environment[key];
      if (value !== undefined) env[key] = value;
      continue;
    }

    if (!entries.some((e) => e.source === app && !e.client)) continue;
    const meta = entries[0]!.meta;
    if (meta.secrecy === "secret") {
      if (!storable.has(key)) {
        minted.push(key);
        continue;
      }
    } else if (meta.secrecy !== "public") {
      continue;
    }

    const value = environment[key];
    if (value === undefined || value === "") absent.push(key);
    else env[key] = value;
  }

  return { env, absent, minted };
}

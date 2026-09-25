/**
 * Resolving the Supabase project `devtools oauth` configures — the "target".
 *
 * Two kinds:
 *
 *   * `local` — whatever Supabase project `supabase status` reports for
 *     `cwd` (`db.ts`'s `detectLocalSupabase`, unchanged from the original
 *     wizard).
 *   * `hosted` — a Supabase project this machine has no local stack for at
 *     all: staging, production, or someone else's. Its URL and service-role
 *     key come from wherever devtools already knows to look, in order:
 *
 *       1. Inside a DevDogsUGA checkout, from the checked-out repo's own env
 *          handling: the platform app's `API_URL`/`SECRET_KEY` for a tier
 *          the contributor picks (TASK-345's forward note — tier resolution
 *          stays LAZY, done here rather than by the launcher, and only when
 *          "hosted" is actually chosen).
 *       2. Outside a checkout — a workshop repo, most likely — from
 *          `.env.local` or `.env` in `cwd`, read for `SUPABASE_URL` /
 *          `SUPABASE_SERVICE_ROLE_KEY` (the names the wider Supabase
 *          ecosystem already uses for exactly this pair, so a project that
 *          already has them needs no new convention).
 *       3. Neither: the wizard prompts, same as the original manual flow
 *          always did for local.
 *
 * Every function below returns data or throws; none of them prompt. Prompting
 * is `wizard.ts`'s job — this module stays testable without `@clack/prompts`
 * in the loop.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";
import type { DeployEnvironment } from "@devdogsuga/env";
import { detectLocalSupabase, type LocalSupabaseConfig } from "./db.js";

export type TargetKind = "local" | "hosted";

export interface ConnectTarget extends LocalSupabaseConfig {
  kind: TargetKind;
}

/** The env var names a hosted target's URL/service-role key carry OUTSIDE a checkout. */
export const HOSTED_TARGET_ENV_KEYS = {
  url: "SUPABASE_URL",
  serviceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
} as const;

/** `supabase status` failed, or the two keys it reports are incomplete — see `db.ts`. */
export async function resolveLocalTarget(cwd: string): Promise<ConnectTarget> {
  const config = detectLocalSupabase(cwd);
  return { ...config, kind: "local" };
}

/**
 * Reads a hosted target's URL/service-role key from `.env.local`, then
 * `.env`, in `cwd`. Returns an empty object (not a throw) when neither file
 * has both keys — that is the ordinary "prompt for them" case, not an error.
 */
export function readHostedTargetFromEnvFiles(
  cwd: string,
): Partial<LocalSupabaseConfig> {
  for (const file of [".env.local", ".env"]) {
    const path = join(cwd, file);
    if (!existsSync(path)) continue;

    const parsed = parse(readFileSync(path, "utf-8"));
    const apiUrl = parsed[HOSTED_TARGET_ENV_KEYS.url];
    const serviceRoleKey = parsed[HOSTED_TARGET_ENV_KEYS.serviceRoleKey];
    if (apiUrl && serviceRoleKey) return { apiUrl, serviceRoleKey };
  }
  return {};
}

/** A checkout's env handling has no `API_URL`/`SECRET_KEY` for the chosen tier. */
export class HostedCredentialsMissingError extends Error {
  constructor(readonly tier: DeployEnvironment) {
    super(
      `${tier}'s API_URL/SECRET_KEY are not available in this checkout — run ` +
        `\`pnpm devtools env pull --target ${tier}\` first.`,
    );
    this.name = "HostedCredentialsMissingError";
  }
}

/** The chosen tier had no tier to resolve to (declined the picker, or none available). */
export class NoTierResolvedError extends Error {
  constructor() {
    super("No tier was resolved for the hosted Supabase project.");
    this.name = "NoTierResolvedError";
  }
}

export interface RepoHostedTargetDeps {
  /** `tier.ts`'s `resolveTier`, or a test double with the same shape. */
  resolveTier: (
    tierArg: string | undefined,
    message: string,
  ) => Promise<DeployEnvironment | null>;
  /**
   * Loads the chosen tier's env into `process.env` (or `env`, when given) —
   * `@devdogsuga/env/session`'s `enterEnvironment`, called with
   * `override: true`: the launcher already entered `development` for this
   * envFree command (see `launch.ts`), and a DELIBERATE, later choice of a
   * different tier here must win over that earlier one, not lose to it.
   */
  enterEnvironment: (tier: DeployEnvironment) => Promise<void>;
  /** Injectable for tests; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Resolves a hosted target from INSIDE a DevDogsUGA checkout: asks which
 * tier (via `resolveTier`, which itself only prompts when more than one
 * tier's env file is present), enters that tier's environment, and reads
 * the platform app's `API_URL`/`SECRET_KEY` back out of it.
 *
 * Throws `NoTierResolvedError` when no tier was resolved (an invalid
 * `--tier`, or a declined picker — `resolveTier` already reported the
 * reason on stderr) and `HostedCredentialsMissingError` when the resolved
 * tier's env has no `API_URL`/`SECRET_KEY` at all.
 */
export async function resolveHostedTargetInRepo(
  tierArg: string | undefined,
  deps: RepoHostedTargetDeps,
): Promise<ConnectTarget> {
  const tier = await deps.resolveTier(
    tierArg,
    "Which tier's Supabase project are you connecting?",
  );
  if (!tier) throw new NoTierResolvedError();

  await deps.enterEnvironment(tier);

  const env = deps.env ?? process.env;
  const apiUrl = env.API_URL;
  const serviceRoleKey = env.SECRET_KEY;
  if (!apiUrl || !serviceRoleKey) {
    throw new HostedCredentialsMissingError(tier);
  }

  return { apiUrl, serviceRoleKey, kind: "hosted" };
}

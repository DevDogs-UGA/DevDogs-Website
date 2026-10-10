/**
 * `backstage deploy <app|step> [flags]`: the deploy orchestrators and the
 * step commands. Every one of them needs production secrets, and checks for
 * the ones it uses up front.
 *
 * ## The deploy orchestrator
 *
 * `deploy <app> --tier <staging|production>` replaces the three near-identical
 * `cf:deploy:*` shell strings in the app package.json files. It checks for
 * `CLOUDFLARE_API_TOKEN` (the old `require-token` step), writes the Worker's
 * `--secrets-file` from the app's manifest (the old `secrets-file` step; see
 * `secrets-file.ts`), runs a plain `wrangler deploy`, and removes the file.
 * (The docs search index is no longer a deploy step: docs-kit's
 * `populate:search` writes it, from the deploy workflow.) Both Next.js apps are
 * on vinext: the workflow's separate "Build" step already ran `vinext build`,
 * which leaves a Wrangler "config redirect" at `.wrangler/deploy/config.json`
 * pointing at the generated `dist/server/wrangler.json`; a bare `wrangler
 * deploy` from the app dir resolves through it with no `--config` needed.
 * Both apps share one deploy step.
 *
 * Steps (`write-env`, `preflight`, `plan`, `migrate`, `avatars`, `smoke`,
 * `reconcile`, `prune-monitors`) are individually addressable for jobs that run
 * only one. The ones that hold their credentials in the job's own `env:` block
 * and compose no env file (`preflight`, `plan`, `migrate`, `avatars`, `smoke`,
 * `reconcile`, `prune-monitors`), and `write-env`,
 * which CREATES the file tier resolution would otherwise insist on reading,
 * run with `--no-env`.
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { flagValue, positionals } from "@devdogsuga/cli-core/args";
import { loadRegistry } from "@devdogsuga/cli-core/env/discovery";
import { appDirFor } from "@devdogsuga/cli-core/repo/layout";
import { loadEnvLoad } from "@devdogsuga/cli-core/repo/peers";
import {
  reportDevtoolsError,
  reportDevtoolsFailure,
} from "@devdogsuga/cli-core/telemetry";
import { isWorkerApp } from "@devdogsuga/cli-core/workers";
import { catalog } from "../catalog.js";
import { runDeployAvatars } from "./avatars.js";
import { runDeployMigrate, runDeployPlan } from "./migrations.js";
import { runPruneMonitors } from "./monitors.js";
import { runPreflight } from "./preflight.js";
import { DeployError, say } from "./report.js";
import { runDeploySecretsFile } from "./secrets-file.js";
import { runReconcile, runSmoke } from "./smoke.js";
import { isTier, type Tier } from "./smoke-config.js";
import { requireCloudflareToken } from "./token.js";
import { renderWriteEnvReport, runDeployWriteEnv } from "./write-env.js";

/**
 * Wrangler's local Hyperdrive emulator wants its binding-specific alias, not
 * `DB_URL`. Mirror both of `process.env`'s relevant keys into a scratch
 * object so the shared `applyWranglerLocalDatabaseAlias` guard — never
 * clobber an alias someone already set — runs against the same values it
 * would in-process, then hand back only the alias override for `pnpm()`'s
 * env merge (`DB_URL` itself reaches the child already, via the base
 * `process.env` spread).
 */
async function hyperdriveLocalAliasEnv(): Promise<Record<string, string>> {
  const { applyWranglerLocalDatabaseAlias, HYPERDRIVE_LOCAL_CONNECTION_ENV } =
    await loadEnvLoad();
  const scratch: Record<string, string> = {};
  const existingAlias = process.env[HYPERDRIVE_LOCAL_CONNECTION_ENV];
  if (existingAlias !== undefined) {
    scratch[HYPERDRIVE_LOCAL_CONNECTION_ENV] = existingAlias;
  }
  if (process.env.DB_URL !== undefined) scratch.DB_URL = process.env.DB_URL;
  applyWranglerLocalDatabaseAlias(scratch);
  delete scratch.DB_URL;
  return scratch;
}

/**
 * Runs a command via pnpm, inheriting stdio, returning the exit code.
 *
 * All orchestrator steps are external processes rather than imported
 * functions: `wrangler` owns its stdout and must not be wrapped.
 */
function pnpm(
  args: string[],
  env?: Record<string, string>,
  cwd?: string,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("pnpm", args, {
      stdio: "inherit",
      ...(cwd === undefined ? {} : { cwd }),
      env: { ...process.env, ...env },
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/** `--tier`, else `DEPLOY_ENV`, and only a deployed tier. */
export function requireTier(rest: readonly string[]): Tier {
  const tier = flagValue([...rest], "--tier") ?? process.env.DEPLOY_ENV;
  if (!tier) {
    throw new DeployError("--tier <staging|production> is required.", [
      "Or set DEPLOY_ENV in the environment.",
    ]);
  }
  if (!isTier(tier)) {
    throw new DeployError(`Unknown tier "${tier}".`, [
      "Use --tier staging or --tier production.",
    ]);
  }
  return tier;
}

/**
 * `deploy <app> --tier <staging|production>`
 *
 * Orchestrates the full deploy for one app:
 *   1. the Cloudflare token check
 *   2. the Worker's secrets file, from the app's manifest
 *   3. `wrangler deploy`
 *   4. removing the secrets file, whatever happened
 *
 * `--dry-run` prints what would run and exits 0, with no token required.
 */
export async function runAppDeploy(app: string, rest: string[]): Promise<void> {
  const tier = requireTier(rest);
  const dryRun = rest.includes("--dry-run");

  // Every app shares one deploy shape: a bare `wrangler deploy -e <tier>` from
  // the app directory. That directory is wherever the repo layout finds the app
  // (`apps/platform` here; schedule-builder under `devdogsuga/apps` from a
  // Backstage checkout), so pnpm runs IN it rather than filtering by name from
  // a workspace root that may not contain the app. The target environment is baked in at BUILD time (the
  // workflow's "Build" step ran `vinext build` with `CLOUDFLARE_ENV=$tier`),
  // which leaves a Wrangler "config redirect". `-e` is passed regardless:
  // Wrangler cross-checks it against the environment the build was tagged
  // with and errors loudly on a mismatch, rather than silently deploying the
  // wrong tier.
  const deployArgs = ["exec", "wrangler", "deploy", "-e", tier];
  // See apps/*/cloudflare/worker.ts's `WorkerEnv` doc: `SENTRY_RELEASE` is the
  // deploy's git SHA, minted fresh by CI every run rather than a value the
  // vault holds, so it reaches the Worker as a `--var` here rather than
  // through `~/env`'s schema or the secrets file. Absent outside a CI-driven
  // deploy.
  const release = process.env.SENTRY_RELEASE
    ? ["--var", `SENTRY_RELEASE:${process.env.SENTRY_RELEASE}`]
    : [];

  if (dryRun) {
    say([
      `backstage deploy ${app} --tier ${tier} --dry-run`,
      "  Check CLOUDFLARE_API_TOKEN",
      `  Write ${app}'s Worker secrets file from its manifest`,
      `  Deploy ${app} (${tier})`,
    ]);
    return;
  }

  // Checked inline so the step list above prints on --dry-run without the
  // token.
  requireCloudflareToken("deploy");

  let cleanup: string | undefined;
  try {
    await loadRegistry();
    const written = await runDeploySecretsFile({
      app,
      githubOutput: false,
    });
    cleanup = written.dir;
    const secretsFile = written.file;

    const code = await pnpm(
      [...deployArgs, "--secrets-file", secretsFile, ...release],
      await hyperdriveLocalAliasEnv(),
      appDirFor(app),
    );
    if (code !== 0) {
      // A subprocess (`pnpm … wrangler deploy`) whose output already explains
      // itself in the job log; this is only the signal that a deploy broke,
      // grouped per app.
      reportDevtoolsFailure(`backstage deploy ${app}: wrangler deploy failed`, {
        tier,
        exitCode: code,
      });
      process.exitCode = code;
    }
  } finally {
    // The file holds every secret the Worker gets. The runner is ephemeral;
    // a laptop is not.
    if (cleanup) rmSync(cleanup, { recursive: true, force: true });
  }
}

/** The one-line-plus-detail rendering of a failed step, on stderr. */
export function renderDeployFailure(label: string, err: unknown): void {
  say(
    err instanceof DeployError
      ? [`${label}: ${err.message}`, ...err.detail.map((line) => `  ${line}`)]
      : [`${label}: ${err instanceof Error ? err.message : String(err)}`],
  );
  // Caught here, so the launcher's capture never sees it. Every deploy step
  // runs in CI, where a failure is never the reader's typo to fix.
  reportDevtoolsError(err);
  process.exitCode = 1;
}

/** Whether a dry run stops before this step, because the step writes. */
function writesWhenLive(sub: string): boolean {
  return sub === "write-env" || sub === "migrate" || sub === "avatars";
}

/**
 * The steps, by name.
 */
async function runStep(sub: string, rest: string[]): Promise<boolean> {
  if (sub === "plan") {
    await runDeployPlan(flagValue(rest, "--label"), process.env, undefined, {
      includeSeed: rest.includes("--include-seed"),
    });
    return true;
  }
  if (sub === "migrate") {
    await runDeployMigrate(process.env, undefined, {
      includeSeed: rest.includes("--include-seed"),
    });
    return true;
  }
  if (sub === "avatars") {
    await runDeployAvatars();
    return true;
  }
  if (sub === "preflight") {
    await runPreflight();
    return true;
  }
  if (sub === "smoke") {
    await runSmoke({
      app: flagValue(rest, "--app") ?? "platform",
      tier: requireTier(rest),
    });
    return true;
  }
  if (sub === "reconcile") {
    await runReconcile({
      app: flagValue(rest, "--app") ?? "platform",
      tier: requireTier(rest),
    });
    return true;
  }
  if (sub === "prune-monitors") {
    await runPruneMonitors({
      app: flagValue(rest, "--app") ?? "platform",
      tier: requireTier(rest),
      dryRun: rest.includes("--dry-run"),
    });
    return true;
  }
  if (sub === "write-env") {
    await loadRegistry();
    const index = rest.indexOf("--source");
    const source = index === -1 ? null : rest[index + 1];
    if (index !== -1 && (!source || source.startsWith("--"))) {
      throw new DeployError(
        "--source needs a manifest name, e.g. --source supabase.",
      );
    }
    const result = await runDeployWriteEnv({ source });
    say(renderWriteEnvReport(result));
    return true;
  }
  return false;
}

/** Steps that went away, refused with where they went. */
const RETIRED_STEPS: Record<string, string> = {
  "require-token":
    "`deploy require-token` is gone: every command checks for the token it needs.",
  "require-planner": "`deploy require-planner` is now `planner status`.",
  "secrets-file": "`deploy secrets-file` is folded into `deploy <app>`.",
  orphans: "`deploy orphans` is now `env audit [--prune]`.",
};

// ── Deploy dispatch ───────────────────────────────────────────────────────────

export async function runDeployCommand(rest: string[]): Promise<void> {
  const [sub] = positionals(rest);

  if (!sub) {
    const steps = catalog.subcommandNames(["deploy"]);
    const width = Math.max(...steps.map((name) => name.length)) + 2;
    say([
      "backstage deploy: which step or app?",
      ...steps.map(
        (name) =>
          `  ${name.padEnd(width)}${catalog.findCommand(["deploy", name])!.summary}`,
      ),
    ]);
    process.exitCode = 1;
    return;
  }

  try {
    // The steps that write (an env file, the database) stop at `--dry-run`
    // and say what they would have done. The rest only read or check.
    if (rest.includes("--dry-run") && writesWhenLive(sub)) {
      say([`Would run: backstage deploy ${rest.join(" ")}`]);
      return;
    }

    // Steps first: they run without a checkout, and `isWorkerApp` reads one.
    if (await runStep(sub, rest)) return;

    // App orchestrators
    if (isWorkerApp(sub)) {
      await runAppDeploy(sub, rest.slice(1));
      return;
    }

    say([
      RETIRED_STEPS[sub] ?? `backstage deploy: unknown subcommand "${sub}".`,
    ]);
    process.exitCode = 1;
  } catch (err) {
    renderDeployFailure(`backstage deploy ${sub}`, err);
  }
}

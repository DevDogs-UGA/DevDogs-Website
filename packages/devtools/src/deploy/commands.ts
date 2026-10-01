/**
 * `devtools-ci deploy <app|step> [flags]`: the deploy orchestrators and the
 * step commands.
 *
 * ## The deploy orchestrator
 *
 * `devtools-ci deploy <app> --tier <staging|production>` replaces the three
 * near-identical `cf:deploy:*` shell strings in the app package.json files.
 * It runs `require-token`, then a plain `wrangler deploy` for all three apps.
 * (The docs search index is no longer a deploy step: docs-kit's
 * `populate:search` writes it, from the cutover's deploy workflow.)
 * Both Next.js apps are on vinext now -- deploy-app.yaml's separate "Build"
 * step already ran `vinext build` (`cf:build:$DEPLOY_ENV`), which leaves a
 * Wrangler "config redirect" at `.wrangler/deploy/config.json` pointing at
 * the generated `dist/server/wrangler.json`; a bare `wrangler deploy` from
 * the app dir resolves through that redirect with no `--config` needed.
 * Sandbox (plain Worker, wrangler bundles it at deploy time) always used
 * this shape, so all three apps now share one deploy step.
 *
 * Step commands (`write-env`, `secrets-file`, etc.) are still individually
 * addressable for jobs that run only one step.
 */
import { spawn } from "node:child_process";
import { loadEnvLoad } from "@devdogsuga/cli-core/repo/peers";
import { DeployError, say } from "./report.js";
import { renderWriteEnvReport, runDeployWriteEnv } from "./write-env.js";
import { runDeploySecretsFile } from "./secrets-file.js";
import { runDeployOrphans } from "./orphans.js";
import { runPreflight } from "./preflight.js";
import { runDeployMigrate, runDeployPlan } from "./migrations.js";
import { runRequirePlanner } from "./require-planner.js";
import { runRequireToken } from "./require-token.js";
import { loadRegistry } from "@devdogsuga/cli-core/env/discovery";
import { flagValue, positionals } from "@devdogsuga/cli-core/args";
import { isWorkerApp, workerApps } from "@devdogsuga/cli-core/workers";
import {
  reportDevtoolsError,
  reportDevtoolsFailure,
} from "@devdogsuga/cli-core/telemetry";

import { catalog } from "../catalog.js";

// `WORKER_APPS` is read from root `workers.json` at runtime rather than
// declared as a literal tuple, so it cannot narrow to a union of string
// literals the way the old `["platform", ...] as const` did. `App` stays
// `string`; `isApp` still refuses anything not in the shared list. It is
// deliberately not a type predicate: `value is string` would narrow the
// fall-through `sub` to `never`.
type App = string;

function isApp(value: string): boolean {
  return isWorkerApp(value);
}

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
 * functions: `wrangler` (and, for platform, the docs build) own their own
 * stdout and must not be wrapped.
 */
function pnpm(args: string[], env?: Record<string, string>): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("pnpm", args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/**
 * `devtools-ci deploy <app> --tier <staging|production>`
 *
 * Orchestrates the full deploy for one app:
 *   1. `require-token` guard
 *   2. Docs index (platform only)
 *   3. App deploy via `wrangler deploy`
 *
 * The `--dry-run` flag prints what would run and exits 0.
 */
async function runAppDeploy(app: App, rest: string[]): Promise<void> {
  const tier = flagValue(rest, "--tier") ?? process.env.DEPLOY_ENV;
  if (!tier) {
    throw new DeployError("--tier <staging|production> is required.", [
      "Or set DEPLOY_ENV in the environment.",
    ]);
  }
  if (tier !== "staging" && tier !== "production") {
    throw new DeployError(`Unknown tier "${tier}".`, [
      "Use --tier staging or --tier production.",
    ]);
  }

  const dryRun = rest.includes("--dry-run");
  const secretsFile = process.env.DEPLOY_SECRETS_FILE;

  const steps: { label: string; fn: () => Promise<number> }[] = [];

  // All three apps now share one deploy shape: a bare `wrangler deploy -e
  // <tier>` from the app directory. Both Next.js apps' target environment is
  // baked in at BUILD time (deploy-app.yaml's separate "Build" step already
  // ran `cf:build:$DEPLOY_ENV`, i.e. `vinext build` with
  // `CLOUDFLARE_ENV=$tier`), which leaves a Wrangler "config redirect" at
  // `.wrangler/deploy/config.json` pointing at `dist/server/wrangler.json`;
  // sandbox is a plain Worker with no such redirect and no build step at all.
  // `-e` is passed regardless: for the vinext apps, Wrangler cross-checks it
  // against the environment the build was tagged with and errors loudly on a
  // mismatch, rather than silently deploying the wrong tier.
  const deployArgs = [
    "--filter",
    app,
    "exec",
    "wrangler",
    "deploy",
    "-e",
    tier,
  ];
  if (secretsFile) deployArgs.push("--secrets-file", secretsFile);
  // See apps/*/cloudflare/worker.ts's `WorkerEnv` doc: `SENTRY_RELEASE` is
  // the deploy's git SHA, minted fresh by CI every run rather than a value
  // Bitwarden holds, so it reaches the Worker as a `--var` here rather than
  // through `~/env`'s schema or the secrets file above. Absent outside a
  // CI-driven deploy.
  if (process.env.SENTRY_RELEASE) {
    deployArgs.push("--var", `SENTRY_RELEASE:${process.env.SENTRY_RELEASE}`);
  }
  steps.push({
    label: `Deploy ${app} (${tier})`,
    // sandbox has no Hyperdrive binding, so the local-database alias is a
    // no-op for it; passing it unconditionally keeps this one step shape for
    // all three apps rather than branching again just to omit it.
    fn: async () => pnpm(deployArgs, await hyperdriveLocalAliasEnv()),
  });

  if (dryRun) {
    say([
      `devtools-ci deploy ${app} --tier ${tier} --dry-run`,
      ...steps.map((s) => `  ${s.label}`),
    ]);
    return;
  }

  // require-token guard: checked inline so the step list above prints on
  // --dry-run without requiring the token.
  runRequireToken();

  for (const step of steps) {
    const code = await step.fn();
    if (code !== 0) {
      // A step is a subprocess (`pnpm … wrangler deploy`) whose output
      // already explains itself in the job log; this is only the signal that
      // a deploy broke, grouped per app and step.
      reportDevtoolsFailure(
        `devtools-ci deploy ${app}: "${step.label}" failed`,
        { tier, exitCode: code },
      );
      process.exitCode = code;
      return;
    }
  }
}

// ── Deploy dispatch ───────────────────────────────────────────────────────────

export async function runDeployCommand(rest: string[]): Promise<void> {
  const [sub] = positionals(rest);

  if (!sub) {
    const steps = catalog.subcommandCiNames(["deploy"]);
    const width = Math.max(...steps.map((name) => name.length)) + 2;
    say([
      "devtools-ci deploy: which step or app?",
      ...steps.map(
        (name) =>
          `  ${name.padEnd(width)}${catalog.findCiCommand(["deploy", name])!.summary}`,
      ),
    ]);
    process.exitCode = 1;
    return;
  }

  // App orchestrators
  if (isApp(sub)) {
    await runAppDeploy(sub, rest.slice(1));
    return;
  }

  // The steps that write (an env file, a secrets file, the database, Worker
  // secrets) stop at `--dry-run` and say what they would have done. The rest
  // only read or check, so there is nothing to skip.
  if (
    rest.includes("--dry-run") &&
    (sub === "write-env" ||
      sub === "secrets-file" ||
      sub === "migrate" ||
      (sub === "orphans" && rest.includes("--prune")))
  ) {
    say([`Would run: devtools-ci deploy ${rest.join(" ")}`]);
    return;
  }

  try {
    if (sub === "require-token") {
      runRequireToken();
      return;
    }

    if (sub === "require-planner") {
      await runRequirePlanner();
      return;
    }

    if (sub === "plan") {
      await runDeployPlan(flagValue(rest, "--label"));
      return;
    }

    if (sub === "migrate") {
      await runDeployMigrate();
      return;
    }

    if (sub === "preflight") {
      await runPreflight();
      return;
    }

    await loadRegistry();

    if (sub === "write-env") {
      const index = rest.indexOf("--source");
      const source = index === -1 ? null : rest[index + 1];
      if (index !== -1 && (!source || source.startsWith("--"))) {
        throw new DeployError(
          "--source needs a manifest name, e.g. --source supabase.",
        );
      }
      const result = await runDeployWriteEnv({ source });
      say(renderWriteEnvReport(result));
      return;
    }

    if (sub === "secrets-file") {
      const app = flagValue(rest, "--app");
      if (!app) {
        throw new DeployError("--app <name> is required.", [
          "It names the workspace app whose manifest declares the Worker's",
          `secrets — ${workerApps().join(", ")}.`,
        ]);
      }
      await runDeploySecretsFile({ app });
      return;
    }

    if (sub === "orphans") {
      await runDeployOrphans({ prune: rest.includes("--prune") });
      return;
    }

    say([`devtools-ci deploy: unknown subcommand "${sub}".`]);
    process.exitCode = 1;
  } catch (err) {
    say(
      err instanceof DeployError
        ? [
            `devtools-ci deploy ${sub}: ${err.message}`,
            ...err.detail.map((line) => `  ${line}`),
          ]
        : [
            `devtools-ci deploy ${sub}: ${err instanceof Error ? err.message : String(err)}`,
          ],
    );
    // Caught here, so `launch-ci.ts`'s capture never sees it. Every deploy
    // step runs in CI, where a failure is never the reader's typo to fix.
    reportDevtoolsError(err);
    process.exitCode = 1;
  }
}

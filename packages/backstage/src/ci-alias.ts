/**
 * The deprecated `devtools-ci` and `devtools-ci-bare` bins, forwarding to
 * backstage's code until the DevDogsUGA cutover (TASK-403).
 *
 * devtools and backstage run from npm at the latest version everywhere, so
 * DevDogsUGA's `main` still calls `devtools-ci deploy <app|step>` from the
 * pinned devtools until its workflows move to `backstage`. These bins live in
 * devtools' package (that is the one `main` has installed) but run THIS code,
 * bundled into devtools' `dist/`; `@devdogsuga/backstage/ci-alias` is a source
 * entry only devtools' build resolves, never part of the published backstage.
 * Deleting this file, the exports entry and devtools' two bins is the cutover's
 * last step.
 *
 * What differs from `backstage`:
 *
 *   * `devtools-ci-bare` is `backstage --no-env`: no tier, no env file.
 *   * `devtools-ci` loads the tier's env files (`--tier` or `DEPLOY_ENV`, the
 *     tier is never asked), and neither asks the hosted-tier question nor
 *     insists that a `deploy` command names its tier, as they never did.
 *   * The `deploy` steps the new tree folded away still run here, so the old
 *     workflows keep working: `require-token`, `require-planner` (now
 *     `planner status`), `secrets-file` (now part of `deploy <app>`) and
 *     `orphans` (now `env audit`). A `DEPLOY_SECRETS_FILE` set by the old
 *     `secrets-file` step is uploaded as it is by `deploy <app>`.
 */
import { flagValue } from "@devdogsuga/cli-core/args";
import { loadRegistry } from "@devdogsuga/cli-core/env/discovery";
import { runDeployOrphans } from "./env/orphans.js";
import { runDeployCommand } from "./deploy/commands.js";
import { DeployError, say } from "./deploy/report.js";
import { runDeploySecretsFile } from "./deploy/secrets-file.js";
import { requireCloudflareToken } from "./deploy/token.js";
import { launchWith } from "./launch-core.js";
import { runPlannerStatus } from "./planner/commands.js";

/** The old steps, which no longer exist in the command tree. */
async function legacyStep(sub: string, rest: string[]): Promise<boolean> {
  // These write (a secrets file, Worker secrets), so a dry run stops here, as
  // it did before.
  if (
    rest.includes("--dry-run") &&
    (sub === "secrets-file" || (sub === "orphans" && rest.includes("--prune")))
  ) {
    say([`Would run: devtools-ci deploy ${rest.join(" ")}`]);
    return true;
  }

  if (sub === "require-token") {
    requireCloudflareToken("deploy");
    return true;
  }

  if (sub === "require-planner") {
    const url = process.env.DB_URL;
    if (!url) {
      throw new DeployError("DB_URL is not set — refusing to plan.", [
        "This step runs with the preflight environment's DB_URL: the",
        "migration_planner role, pushed by `env push --target preflight`.",
        "An empty value usually means the environment secret was never",
        "pushed, or the workflow step lost its env: block.",
      ]);
    }
    await runPlannerStatus({ credentialUrl: url });
    return true;
  }

  if (sub === "secrets-file") {
    const app = flagValue(rest, "--app");
    if (!app) {
      throw new DeployError("--app <name> is required.", [
        "It names the workspace app whose manifest declares the Worker's",
        "secrets.",
      ]);
    }
    await loadRegistry();
    await runDeploySecretsFile({ app });
    return true;
  }

  if (sub === "orphans") {
    await loadRegistry();
    await runDeployOrphans({ prune: rest.includes("--prune") });
    return true;
  }

  return false;
}

async function dispatch(argv: string[]): Promise<void> {
  const [first, ...rest] = argv;

  if (!first || first === "--help" || first === "-h") {
    // Stdout, as it always was: this is the usage a person asked for.
    process.stdout.write(
      [
        "devtools-ci <command>   (deprecated: use `backstage`)",
        "",
        "Commands:",
        "  deploy  Deploy an app or run a deploy step.",
        "",
        "Run `devtools-ci deploy` for the full step list.",
        "",
      ].join("\n"),
    );
    return;
  }

  if (first === "deploy") {
    await runDeployCommand(rest, legacyStep, {
      secretsFile: nonEmptyEnv("DEPLOY_SECRETS_FILE"),
    });
    return;
  }

  say([`devtools-ci: unknown command "${first}".`]);
  process.exitCode = 1;
}

function nonEmptyEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

/** `devtools-ci`: the tier's env files loaded first. */
export function launchCi(argv: readonly string[]): Promise<void> {
  return launchWith(argv, {
    dispatch,
    gate: false,
    cli: "devtools",
    label: "devtools-ci",
    lenientTier: true,
  });
}

/** `devtools-ci-bare`: the caller's environment, nothing loaded. */
export function launchCiBare(argv: readonly string[]): Promise<void> {
  return launchCi(["--no-env", ...argv]);
}

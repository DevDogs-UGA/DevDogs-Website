/**
 * `deploy smoke` and `deploy reconcile`: the read-only post-deploy checks that
 * replace DevDogsUGA's `packages/deploy-checks`.
 *
 * Both run after an app's Worker deploy and exit non-zero (failing that
 * tier's deploy job) when a check fails. Both report through `say()`: stdout
 * belongs to the machine here, see `report.ts`.
 *
 *   * `smoke` (per TASK-300): every listed public route answers 200; the one
 *     known protected route redirects an anonymous request; this deploy's
 *     Sentry release is visible, skipped with a notice, not failed, when
 *     `SENTRY_AUTH_TOKEN` is absent (Sentry not onboarded yet). Crons
 *     monitors are not checked; see `sentry.ts` for why. It deliberately does
 *     NOT re-check config-reconcile: `reconcile` below is the sole
 *     authoritative trigger for a deploy.
 *   * `reconcile`: `GET /cron/config-reconcile` on the platform, authenticated
 *     with `CRON_SECRET`, run after THIS deploy rather than at migrate time:
 *     `@devdogsuga/events`' config is bundled into the Worker at build time, so
 *     a migrate-time call would reconcile against the PREVIOUS release's
 *     config. Only the platform serves the route; the config being reconciled
 *     (meetings, workshops) is its alone.
 *
 * The per-app data (hosts, public paths, the protected path) comes from the
 * checkout; see `smoke-config.ts`.
 */
import {
  allPassed,
  checkProtectedRedirect,
  checkPublicRoute,
  checkReconcile,
  formatResults,
  retryWhilePropagating,
  type CheckResult,
  type FetchLike,
} from "./checks.js";
import { DeployError, say } from "./report.js";
import {
  checkSentryRelease,
  resolveSentryConfig,
  skippedSentryCheck,
} from "./sentry.js";
import {
  smokeConfigFor,
  type AppSmokeConfig,
  type Tier,
} from "./smoke-config.js";

export interface SmokeOptions {
  app: string;
  tier: Tier;
  /** Defaults to the ambient environment; a parameter so tests need not mutate it. */
  env?: NodeJS.ProcessEnv;
  /** The app's smoke data; defaults to the checkout's. */
  config?: AppSmokeConfig;
  /** Defaults to the global `fetch`, behind the 503 retry. */
  fetchImpl?: FetchLike;
  /** Defaults to the real Sentry check. */
  checkRelease?: typeof checkSentryRelease;
}

function configOrRefuse(
  app: string,
  config: AppSmokeConfig | undefined,
): AppSmokeConfig {
  const found = config ?? smokeConfigFor(app);
  if (!found) {
    throw new DeployError(`${app} has no smoke test configured.`, [
      `Add a "smoke" field to its entry in workers.json (hosts, publicPaths,`,
      `protectedPath, protectedRedirectPrefix).`,
    ]);
  }
  return found;
}

/** Runs the smoke checks and returns every result; sets the exit code on a failure. */
export async function runSmoke(options: SmokeOptions): Promise<CheckResult[]> {
  const env = options.env ?? process.env;
  const config = configOrRefuse(options.app, options.config);
  const origin = `https://${config.hosts[options.tier]}`;
  // A 503 while the new version propagates isn't a broken route; see
  // `retryWhilePropagating`.
  const fetchApp = options.fetchImpl ?? retryWhilePropagating();

  const results: CheckResult[] = [];
  for (const path of config.publicPaths) {
    results.push(await checkPublicRoute(`${origin}${path}`, fetchApp));
  }
  results.push(
    await checkProtectedRedirect(
      `${origin}${config.protectedPath}`,
      config.protectedRedirectPrefix,
      fetchApp,
    ),
  );

  const sentry = resolveSentryConfig({
    SENTRY_AUTH_TOKEN: env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG: env.SENTRY_ORG,
    SENTRY_PROJECT: env.SENTRY_PROJECT,
  });
  if (!sentry) {
    results.push(skippedSentryCheck("Sentry release"));
  } else if (env.GITHUB_SHA) {
    results.push(
      await (options.checkRelease ?? checkSentryRelease)(
        sentry,
        env.GITHUB_SHA,
      ),
    );
  }

  say(formatResults(results).split("\n"));
  for (const result of results) {
    if (result.status === "skip") {
      say([`::notice::${result.name} skipped -- ${result.detail}`]);
    }
  }
  if (!allPassed(results)) process.exitCode = 1;
  return results;
}

export interface ReconcileOptions {
  tier: Tier;
  /** Only the platform serves the route; here for the tests. */
  app?: string;
  env?: NodeJS.ProcessEnv;
  config?: AppSmokeConfig;
  fetchImpl?: FetchLike;
}

export async function runReconcile(
  options: ReconcileOptions,
): Promise<CheckResult> {
  const env = options.env ?? process.env;
  // Up front, before any request.
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret) {
    throw new DeployError("CRON_SECRET is not set — refusing to reconcile.", [
      "It authenticates the call to /cron/config-reconcile, and is part of",
      "the tier's env: `backstage env pull --target <tier>`.",
    ]);
  }

  const app = options.app ?? "platform";
  const config = configOrRefuse(app, options.config);
  const url = `https://${config.hosts[options.tier]}/cron/config-reconcile`;
  const result = await checkReconcile(
    url,
    cronSecret,
    options.fetchImpl ?? retryWhilePropagating(),
  );
  say(formatResults([result]).split("\n"));
  if (result.status === "fail") process.exitCode = 1;
  return result;
}

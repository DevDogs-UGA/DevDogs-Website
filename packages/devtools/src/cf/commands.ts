/**
 * Dispatch for `devtools cf *`.
 *
 * Deprecated: only `cf preview` is left, for the app `cf:preview` scripts on
 * DevDogsUGA's main. The cutover swaps those for each app's own `preview`
 * script and deletes this alias. `typegen`, `build` and `exec` are gone
 * (`types:cf`, `DEPLOY_ENV=<tier> pnpm -F <app> build`, `devtools wrangler`).
 */
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { confirm } from "@clack/prompts";
import type * as EnvLoadModule from "@devdogsuga/env/load";
import { loadEnvLoad } from "@devdogsuga/cli-core/repo/peers";
import { run } from "@devdogsuga/cli-core/db/run";
import { buildWorkerApp } from "./build.js";
import { resolveTier } from "@devdogsuga/cli-core/tier";
import { unwrap } from "@devdogsuga/cli-core/ui";
import { isWorkerApp, workerApps } from "@devdogsuga/cli-core/workers";
import { withWranglerEnv } from "./local-env.js";

// A function, not a top-level constant — `workerApps()` reads `workers.json`
// via `findRepoRoot()`, which must not run at import time (see
// `workers.ts`'s header on why that broke `--help`/`setup` outside a repo).
function unknownAppHint(): string {
  return `Expected: ${workerApps().join(", ")}.`;
}

function parseAppAndRest(argv: readonly string[]): {
  app?: string;
  rest: readonly string[];
} {
  const idx = argv.indexOf("--app");
  if (idx === -1 || idx + 1 >= argv.length) return { rest: argv };
  const app = argv[idx + 1];
  const rest = [...argv.slice(0, idx), ...argv.slice(idx + 2)];
  return { app, rest };
}

function parseTier(argv: readonly string[]): string | undefined {
  const idx = argv.indexOf("--tier");
  return idx !== -1 ? argv[idx + 1] : undefined;
}

export async function runCf(argv: readonly string[]): Promise<number> {
  const sub = argv[0];
  const rest = argv.slice(1);

  if (sub === "preview") {
    const { app } = parseAppAndRest(rest);
    if (!app) {
      process.stderr.write("devtools cf preview: --app <slug> is required.\n");
      return 1;
    }
    if (!isWorkerApp(app)) {
      process.stderr.write(
        `devtools cf preview: unknown app "${app}". ${unknownAppHint()}\n`,
      );
      return 1;
    }

    // The command tree's own `--tier` option carries no `prompt` (see
    // `commands.ts`): asking there AND here would ask twice, once on its own
    // wizard screen and once from this resolver, whenever more than one tier
    // file is present. `resolveTier` owns both the validation an explicit
    // `--tier` needs and the conditional prompt an absent one gets.
    const tier = await resolveTier(
      parseTier(rest),
      "Which tier's env should the preview use?",
      { label: "devtools cf preview" },
    );
    if (tier === null) return 1;

    // Previewing production means the local Worker talks to live production
    // data (DB_URL, third-party API keys, the lot) from a developer's own
    // machine — the same exposure `cron run`/`workflows run` gate behind a
    // confirm for a deployed TIER. Staging carries no such weight; it is a
    // normal development target and asks for nothing extra.
    if (tier === "production" && !rest.includes("--yes")) {
      if (!process.stdin.isTTY) {
        process.stderr.write(
          "devtools cf preview: --yes is required to preview production.\n",
        );
        return 1;
      }
      const approved = unwrap(
        await confirm({
          message: `Preview ${app} against live production data?`,
          initialValue: false,
        }),
      );
      if (!approved) return 1;
    }

    const envLoad = await loadEnvLoad();
    let loaded:
      Awaited<ReturnType<typeof EnvLoadModule.loadEnvironment>> | undefined;
    if (tier !== "development") {
      try {
        // This process runs under `with-env` (development), so process.env
        // already holds development's values; override: true makes the
        // tier's own .env.<tier> win instead of quietly previewing against
        // whatever development happened to have loaded.
        loaded = await envLoad.loadEnvironment(tier, { override: true });
      } catch (err) {
        // `err.message` already names the fetch command (see
        // `MissingEnvFileError`'s constructor); repeating it here would just
        // duplicate the line.
        if (err instanceof envLoad.MissingEnvFileError) {
          process.stderr.write(`devtools cf preview: ${err.message}\n`);
          return 1;
        }
        throw err;
      }
    }

    // The build bakes tier-scoped values (NEXT_PUBLIC_* and anything else
    // read at build time) into the bundle, exactly like `cf:build:<tier>`'s
    // `DEPLOY_ENV=<tier> with-env` does — so it gets both the tier's loaded
    // env AND DEPLOY_ENV itself, since build-time code may branch on that
    // variable directly. The `wrangler dev` child below does NOT: the tier
    // reaches the Worker at RUNTIME through the scoped `--env-file`
    // `withWranglerEnv` materializes, not through this process's own
    // environment, so passing DEPLOY_ENV there would be a no-op at best and a
    // stale value baked nowhere at worst.
    //
    // Both Next.js apps are on vinext: `vinext build` additionally needs
    // `CLOUDFLARE_ENV=<tier>` (see each app's `cf:build:<tier>` script) —
    // vinext bakes the target environment in at BUILD time, and `wrangler
    // dev` cross-checks it against `-e`/the env it resolves, erroring loudly
    // on a mismatch rather than silently running the wrong tier. The sandbox
    // app has no framework build; `buildWorkerApp` only builds its workspace
    // dependencies.
    const build = await buildWorkerApp(
      app,
      tier && loaded
        ? { ...loaded.env, DEPLOY_ENV: tier, CLOUDFLARE_ENV: tier }
        : undefined,
    );
    if (build !== 0) return build;

    // Create this after the framework build. Apart from shortening the time a
    // credential-bearing file exists, this prevents build-tool temp cleanup
    // from invalidating the path before Wrangler opens it.
    return withWranglerEnv(
      app,
      (envFile) =>
        // For a vinext app, `wrangler dev` auto-redirects to the just-built
        // `dist/server/wrangler.json` (a "config redirect" vinext writes to
        // `.wrangler/deploy/config.json`), so no `--config` flag is needed.
        // The bundle is already built above; invoke the project's Wrangler
        // directly so the scoped file becomes Worker vars.
        run([
          "--filter",
          app,
          "exec",
          "wrangler",
          "dev",
          "--env-file",
          envFile,
        ]),
      { env: loaded?.env },
    );
  }

  process.stderr.write(
    `devtools cf: unknown subcommand "${sub ?? "(none)"}". ` +
      "Expected: preview.\n",
  );
  return 1;
}

export const handleCf: CommandHandler = async (rest) => {
  process.exitCode = await runCf(rest);
  return DONE;
};

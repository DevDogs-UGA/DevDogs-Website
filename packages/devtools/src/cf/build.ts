/**
 * The build a Worker app needs before `wrangler dev` can boot it locally.
 *
 * The vinext apps' `wrangler.jsonc` is the PRE-build shape: `main` is
 * `cloudflare/worker.ts`, which imports vinext's app-router entry and its
 * `virtual:vinext-*` modules, and `assets.directory` is `dist/client`. Plain
 * `wrangler dev` against that file can never work — esbuild cannot resolve
 * Vite's virtual modules, and on a fresh clone `dist/client` does not exist
 * yet ("The directory specified by the "assets.directory" field ... does not
 * exist"). `vinext build` writes `dist/` plus the `.wrangler/deploy/
 * config.json` redirect that points a bare `wrangler dev` at the built
 * `dist/server/wrangler.json` instead.
 *
 * Building every time, rather than only when `dist/` is missing, also keeps
 * a checkout from running a stale bundle — or one a previous `cf preview
 * --tier staging` baked for another tier.
 *
 * `workflows run`/`serve` use `vinext dev` instead and need none of this
 * except the dependency build (`buildWorkspaceDeps`).
 *
 * The app's workspace dependencies build first, the way `devtools run build`
 * orders them (see `run/commands.ts`): their `exports` resolve to gitignored
 * `dist/` output, so on a fresh clone `vinext build` fails to load
 * `next.config.ts` without them.
 */
import { run } from "@devdogsuga/cli-core/db/run";

function workspaceDepsBuildCommand(app: string): string[] {
  return ["-r", "--if-present", "--filter", `${app}^...`, "run", "build"];
}

/** Build only `app`'s workspace dependencies — all `vinext dev` needs, since
 * it compiles the app itself on demand. */
export function buildWorkspaceDeps(app: string): Promise<number> {
  return run(workspaceDepsBuildCommand(app));
}

/** The pnpm invocations `buildWorkerApp` runs, in order. */
export function workerBuildCommands(app: string): string[][] {
  return [
    workspaceDepsBuildCommand(app),
    ["--filter", app, "exec", "vinext", "build"],
  ];
}

/**
 * Build `app` for a local `wrangler dev`. `env` applies to the framework
 * build only — it bakes tier-scoped values (NEXT_PUBLIC_*, CLOUDFLARE_ENV)
 * into the bundle; the dependency builds are tier-independent `tsc` runs.
 * Resolves to the first non-zero exit code, or 0.
 */
export async function buildWorkerApp(
  app: string,
  env?: NodeJS.ProcessEnv,
): Promise<number> {
  const [, ...framework] = workerBuildCommands(app);
  const depsCode = await buildWorkspaceDeps(app);
  if (depsCode !== 0) return depsCode;
  for (const command of framework) {
    const code = await run(command, env);
    if (code !== 0) return code;
  }
  return 0;
}

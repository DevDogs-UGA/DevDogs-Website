/**
 * `check workers`: `workers.json` is the one list of Worker apps, but nothing
 * else enforces that it stays right. A new `wrangler.jsonc` under a workspace
 * package (or a renamed app directory) could drift from it silently, and the
 * credential-bearing deploy matrix in `.github/workflows/deploy-app.yaml` is
 * hand-written YAML that `workers.json` cannot see at all (it stays literal;
 * no dynamic matrix in a workflow that holds deploy credentials). This is the
 * alarm for both kinds of drift.
 *
 * Moved here from DevDogsUGA's `packages/repo-checks` (`workers.test.ts`). The
 * deploy matrix is defined ONCE in `deploy-app.yaml` (staging and production
 * both call that reusable workflow), so exactly one `matrix.include` block is
 * expected.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { layoutAt, type RepoLayout } from "@devdogsuga/cli-core/repo/layout";
import { parseWorkerEntries } from "@devdogsuga/cli-core/workers";

/** The `packages:` glob list from `pnpm-workspace.yaml`, e.g. `["apps/*",
 * "packages/*", "docs"]`. Stops at the next top-level (column-0) key. */
export function workspaceGlobs(yamlText: string): string[] {
  const lines = yamlText.split("\n");
  const start = lines.findIndex((line) => /^packages:\s*$/.test(line));
  if (start === -1) {
    throw new Error("pnpm-workspace.yaml: no top-level `packages:` key found.");
  }
  const globs: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const match = /^\s*-\s*["']?([^\s#"']+)/.exec(line);
    if (match?.[1]) globs.push(match[1]);
  }
  return globs;
}

/** Expands the workspace globs (a bare name, or `dir/*`) against the
 * filesystem, returning every workspace-relative directory that has its own
 * `package.json`. */
export function expandWorkspacePackages(
  root: string,
  globs: readonly string[],
): string[] {
  const packages: string[] = [];
  for (const glob of globs) {
    if (glob.endsWith("/*")) {
      const dir = glob.slice(0, -2);
      const absoluteDir = join(root, dir);
      if (!existsSync(absoluteDir)) continue;
      for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const relative = `${dir}/${entry.name}`;
        if (existsSync(join(root, relative, "package.json"))) {
          packages.push(relative);
        }
      }
    } else if (existsSync(join(root, glob, "package.json"))) {
      packages.push(glob);
    }
  }
  return packages;
}

/** The `matrix.include` blocks' `app:` values, in the `strategy: matrix:
 * include:` shape the deploy workflows use. An entry may carry other keys
 * (`dir:`, `release:`, `mint:`), indented under its `- app:` line. */
export function deployMatrixApps(yamlText: string): string[][] {
  const lines = yamlText.split("\n");
  const blocks: string[][] = [];
  const indentOf = (line: string): number =>
    line.length - line.trimStart().length;
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*matrix:\s*$/.test(lines[i]!)) continue;
    let j = i + 1;
    while (j < lines.length && !/^\s*include:\s*$/.test(lines[j]!)) j += 1;
    const apps: string[] = [];
    let entryIndent: number | null = null;
    for (let k = j + 1; k < lines.length; k += 1) {
      const line = lines[k]!;
      const appMatch = /^\s*- app:\s*(\S+)\s*$/.exec(line);
      if (appMatch?.[1]) {
        apps.push(appMatch[1]);
        entryIndent ??= indentOf(line);
        continue;
      }
      if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;
      // A key of the current entry sits deeper than its `- app:` dash.
      if (entryIndent !== null && indentOf(line) > entryIndent) continue;
      break;
    }
    if (apps.length > 0) blocks.push(apps);
  }
  return blocks;
}

/**
 * The Workers `deploy.yaml` deploys, read from its calls of the shared
 * `deploy-worker.yaml`: each caller job names its `tier` and `worker_dir`
 * under `with:`. Returns the directories' basenames (the app slugs) per tier.
 * A job that does not call deploy-worker.yaml is ignored.
 */
export function deployWorkerCalls(yamlText: string): {
  staging: string[];
  production: string[];
} {
  const staging: string[] = [];
  const production: string[] = [];
  // A job is a block opened by a two-space-indented key.
  for (const job of yamlText.split(/^ {2}(?=[\w-]+:\s*$)/m)) {
    if (!/uses:\s*\.\/\.github\/workflows\/deploy-worker\.yaml/.test(job)) {
      continue;
    }
    const tier = /^ {6}tier:\s*(\w+)\s*$/m.exec(job)?.[1];
    const dir = /^ {6}worker_dir:\s*(\S+)\s*$/m.exec(job)?.[1];
    if (!tier || !dir) continue;
    (tier === "production" ? production : staging).push(basename(dir));
  }
  return { staging, production };
}

/**
 * Apps with a `wrangler.jsonc` that are deliberately NOT in `workers.json`:
 * `workers.json` is the managed set (deploy matrix, env registry, secret orphan
 * sweep), and these have none of that. `apps/slides` is the hosted workshop
 * deck. It deploys through the same shared `deploy-worker.yaml` as the others
 * (called from slides.yaml, behind the `production` approval), with its smoke
 * test in `apps/slides/smoke.json` because it has no staging tier and no env
 * manifest.
 */
export const HAND_DEPLOYED_APPS: readonly string[] = ["apps/slides"];

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item) => b.includes(item));
}

/**
 * Every drift between `workers.json`, the workspace and the deploy matrix,
 * as one readable line each. Empty means in step.
 *
 * `workers.json` lives at the root of the repo being checked. DevDogsUGA
 * without one manages no Worker apps (the platform moved to Backstage), so
 * there is nothing to check. From a Backstage checkout the apps are looked up
 * in both repos, since schedule-builder is deployed from Backstage but stays in
 * DevDogsUGA's `apps/`.
 */
export function checkWorkers(
  root: string,
  layout: RepoLayout = layoutAt(root),
): string[] {
  const problems: string[] = [];

  const workersFile = join(root, "workers.json");
  if (!existsSync(workersFile)) {
    if (layout.kind === "devdogsuga") return [];
    return ["workers.json does not exist."];
  }
  const paths = parseWorkerEntries(
    JSON.parse(readFileSync(workersFile, "utf8")),
  ).map((entry) => entry.path);
  const apps = paths.map((path) => basename(path));

  const roots = [root];
  if (layout.kind === "backstage" && layout.hasDevdogsuga) {
    roots.push(layout.devdogsugaRoot);
  }
  const scanned = [
    ...new Set(
      roots.flatMap((dir) => {
        const workspace = join(dir, "pnpm-workspace.yaml");
        return existsSync(workspace)
          ? expandWorkspacePackages(
              dir,
              workspaceGlobs(readFileSync(workspace, "utf8")),
            )
          : [];
      }),
    ),
  ];
  const dirOf = (relative: string): string =>
    join(
      roots.find((dir) => existsSync(join(dir, relative))) ?? root,
      relative,
    );
  const withWrangler = scanned.filter((relative) =>
    existsSync(join(dirOf(relative), "wrangler.jsonc")),
  );
  for (const path of withWrangler.filter(
    (p) => !paths.includes(p) && !HAND_DEPLOYED_APPS.includes(p),
  )) {
    problems.push(`${path} has a wrangler.jsonc but is not in workers.json.`);
  }
  for (const path of paths.filter((p) => !withWrangler.includes(p))) {
    problems.push(`workers.json lists ${path}, which has no wrangler.jsonc.`);
  }

  for (const path of paths) {
    const manifest = join(dirOf(path), "package.json");
    if (!existsSync(manifest)) continue;
    const name = (
      JSON.parse(readFileSync(manifest, "utf8")) as { name?: string }
    ).name;
    const slug = path.split("/").pop();
    if (name !== slug) {
      problems.push(
        `${path}/package.json is named "${name}"; the directory name, package name and app slug must agree ("${slug}").`,
      );
    }
  }

  // A Worker the deploy workflow does not deploy is a Worker nothing ships:
  // `workers.json` lists it, its code merges, and no pipeline puts it live.
  // The same drift in the other direction would deploy something the list
  // (smoke tests, env registry, orphan sweep) does not know.
  const deployWorkflow = join(root, ".github", "workflows", "deploy.yaml");
  if (existsSync(deployWorkflow)) {
    const calls = deployWorkerCalls(readFileSync(deployWorkflow, "utf8"));
    if (calls.staging.length === 0) {
      problems.push("deploy.yaml has no staging Worker deploy.");
    } else if (!sameSet(calls.staging, apps)) {
      problems.push(
        `deploy.yaml deploys [${calls.staging.join(", ")}] to staging; workers.json lists [${apps.join(", ")}].`,
      );
    }
    if (calls.production.length > 0 && !sameSet(calls.production, apps)) {
      problems.push(
        `deploy.yaml deploys [${calls.production.join(", ")}] to production; workers.json lists [${apps.join(", ")}].`,
      );
    }
  }

  const deployApp = join(root, ".github", "workflows", "deploy-app.yaml");
  if (!existsSync(deployApp)) {
    // `deploy.yaml` carries its own matrix; only a repo that still has the
    // reusable `deploy-app.yaml` has one to drift.
    return problems;
  }
  const blocks = deployMatrixApps(readFileSync(deployApp, "utf8"));
  // One matrix, shared by staging and production: a restructure that drops it,
  // or reintroduces a second literal copy, is itself drift.
  if (blocks.length !== 1) {
    problems.push(
      `deploy-app.yaml should define its deploy matrix once; found ${blocks.length}.`,
    );
  }
  for (const block of blocks) {
    if (!sameSet(block, apps)) {
      problems.push(
        `deploy-app.yaml's matrix is [${block.join(", ")}]; workers.json lists [${apps.join(", ")}].`,
      );
    }
  }

  return problems;
}

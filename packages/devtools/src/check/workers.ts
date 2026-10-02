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
 * include:` shape `deploy-app.yaml` uses. */
export function deployMatrixApps(yamlText: string): string[][] {
  const lines = yamlText.split("\n");
  const blocks: string[][] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*matrix:\s*$/.test(lines[i]!)) continue;
    let j = i + 1;
    while (j < lines.length && !/^\s*include:\s*$/.test(lines[j]!)) j += 1;
    const apps: string[] = [];
    for (let k = j + 1; k < lines.length; k += 1) {
      const line = lines[k]!;
      const appMatch = /^\s*- app:\s*(\S+)\s*$/.exec(line);
      if (appMatch?.[1]) {
        apps.push(appMatch[1]);
        continue;
      }
      if (/^\s*mint:/.test(line) || /^\s*#/.test(line) || /^\s*$/.test(line)) {
        continue;
      }
      break;
    }
    if (apps.length > 0) blocks.push(apps);
  }
  return blocks;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item) => b.includes(item));
}

/** Every drift between `workers.json`, the workspace and the deploy matrix,
 * as one readable line each. Empty means in step. */
export function checkWorkers(root: string): string[] {
  const problems: string[] = [];

  const paths = parseWorkerEntries(
    JSON.parse(readFileSync(join(root, "workers.json"), "utf8")),
  ).map((entry) => entry.path);
  const apps = paths.map((path) => basename(path));

  const scanned = expandWorkspacePackages(
    root,
    workspaceGlobs(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8")),
  );
  const withWrangler = scanned.filter((relative) =>
    existsSync(join(root, relative, "wrangler.jsonc")),
  );
  for (const path of withWrangler.filter((p) => !paths.includes(p))) {
    problems.push(`${path} has a wrangler.jsonc but is not in workers.json.`);
  }
  for (const path of paths.filter((p) => !withWrangler.includes(p))) {
    problems.push(`workers.json lists ${path}, which has no wrangler.jsonc.`);
  }

  for (const path of paths) {
    const manifest = join(root, path, "package.json");
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

  const deployApp = join(root, ".github", "workflows", "deploy-app.yaml");
  if (!existsSync(deployApp)) {
    problems.push(".github/workflows/deploy-app.yaml does not exist.");
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

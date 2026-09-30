/**
 * Resolves an `@devdogsuga/*` package FROM the target repo, not from
 * devtools' own (dlx-isolated) `node_modules`.
 *
 * Ported from the `devtools-dlx` prototype
 * (`/home/sloan/scratchpad/devdogs/prototypes/devtools-dlx/FINDINGS.md`,
 * experiments 2 and 4 — read that file for the two gotchas this module
 * exists to avoid). The short version:
 *
 *   - `require.resolve(\`${specifier}/package.json\`)` throws
 *     `ERR_PACKAGE_PATH_NOT_EXPORTED` on packages (like `@devdogsuga/env`,
 *     `@devdogsuga/open-graph`) whose `exports` map does not list
 *     `"./package.json"`, even though the file is on disk.
 *   - A resolved path cannot be assumed to contain a literal
 *     `node_modules/<specifier>` segment — pnpm workspace-linked packages
 *     resolve to their REALPATH (e.g. `packages/open-graph/dist/index.js`),
 *     which has no such segment at all.
 *   - `require.resolve` ignores whatever `conditions` a caller has set on
 *     `tsx`'s `register()` — condition-based resolution (the
 *     `devdogs-source` condition) has to be done by hand, reading the
 *     target package's own `exports["."]` map.
 *
 * Both problems are solved the same way: walk up from the resolved file's
 * directory to the nearest `package.json` whose own `"name"` field matches
 * the specifier. That works for a real installed dependency AND a
 * workspace symlink, uniformly.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

export interface ResolvedFromRepo {
  /** Absolute path to the resolved module entry point. */
  resolvedPath: string;
  /** The version declared in the resolved package's own `package.json`. */
  version: string;
  /** Absolute path to the resolved package's `package.json`. */
  pkgJsonPath: string;
}

/**
 * The installable package name a (possibly subpath) specifier belongs to:
 * `@devdogsuga/env/load` → `@devdogsuga/env`, `foo/bar` → `foo`. A repo's
 * package.json declares the PACKAGE as a dependency, never a subpath, so
 * `findDependent` has to search on this rather than the literal specifier a
 * caller wants to import.
 */
export function packageNameOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

/**
 * Scans `apps/*` and `packages/*` under `repoRoot` for the first
 * `package.json` whose `dependencies`/`devDependencies`/`peerDependencies`
 * names `specifier`'s package (see `packageNameOf`). Returns its path
 * relative to `repoRoot`, or `null` if nothing in the repo depends on it.
 *
 * Re-scans the filesystem on every call — fine for a short-lived CLI
 * invocation calling this a handful of times; see FINDINGS item 5 if this
 * is ever called in a hot loop.
 */
export function findDependent(
  repoRoot: string,
  specifier: string,
): string | null {
  const packageName = packageNameOf(specifier);
  const groups = ["apps", "packages"];
  for (const group of groups) {
    const groupDir = join(repoRoot, group);
    let entries: string[];
    try {
      entries = readdirSync(groupDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const pkgJsonPath = join(groupDir, entry, "package.json");
      if (!existsSync(pkgJsonPath)) continue;
      let pkg: {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      try {
        pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
      } catch {
        continue;
      }
      const deps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
      };
      if (packageName in deps) {
        return join(group, entry, "package.json");
      }
    }
  }
  return null;
}

/** Walks up from `startDir` to the nearest `package.json` whose `"name"` matches `specifier`. */
function findOwningPackageJson(startDir: string, specifier: string): string {
  const packageName = packageNameOf(specifier);
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, "utf8")) as {
          name?: unknown;
        };
        if (pkg.name === packageName) return candidate;
      } catch {
        // fall through and keep walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `resolveFromRepo: could not find ${specifier}'s own package.json by walking up from ${startDir}`,
      );
    }
    dir = parent;
  }
}

/**
 * Resolves `specifier` as `resolutionBase` (a workspace-relative
 * `package.json` path known to depend on it, from `findDependent()`) would
 * see it.
 *
 * `opts.condition`, when given, is NOT passed through to Node's resolver —
 * `require.resolve` ignores tsx's `register({ conditions })` entirely (see
 * this module's header). Instead the target package's own
 * `exports["."]` map is read directly and `exports["."][condition]` is
 * picked, falling back to `.default`.
 */
export function resolveFromRepo(
  repoRoot: string,
  resolutionBase: string,
  specifier: string,
  opts?: { condition?: string },
): ResolvedFromRepo {
  const baseFile = join(repoRoot, resolutionBase);
  const require = createRequire(baseFile);

  let resolvedPath: string;
  if (opts?.condition) {
    // Find the package's own package.json first (via a plain resolve of the
    // specifier itself, which DOES work through node's default conditions),
    // then read its exports map by hand.
    const defaultEntry = require.resolve(specifier);
    const pkgJsonPath = findOwningPackageJson(dirname(defaultEntry), specifier);
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
      exports?: Record<string, unknown>;
    };
    const rootExport = pkg.exports?.["."];
    const conditioned =
      rootExport && typeof rootExport === "object"
        ? ((rootExport as Record<string, unknown>)[opts.condition] ??
          (rootExport as Record<string, unknown>).default)
        : undefined;
    if (typeof conditioned !== "string") {
      throw new Error(
        `resolveFromRepo: ${specifier} has no "${opts.condition}" (or "default") export in its exports["."] map`,
      );
    }
    resolvedPath = join(dirname(pkgJsonPath), conditioned);
  } else {
    resolvedPath = require.resolve(specifier);
  }

  const pkgJsonPath = findOwningPackageJson(dirname(resolvedPath), specifier);
  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
    version?: string;
  };

  return {
    resolvedPath,
    version: pkg.version ?? "0.0.0",
    pkgJsonPath,
  };
}

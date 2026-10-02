/**
 * Fills the `@devdogsuga/env` registry by importing every manifest.
 *
 * The registry populates as a SIDE EFFECT of importing each manifest module.
 * `declare()` runs at import time, so a process that never imports them sees an
 * empty registry and every derived selector returns nothing. That is the
 * fail-open shape this module closes: anything that routes secrets calls
 * `loadRegistry()` first, and `assertRegistryLoaded()` is the guard the
 * selectors' consumers use to refuse an empty answer.
 *
 * Discovery is by filename, per the model doc: `src/env.ts`, then `env.ts`, per
 * workspace package. Both present is a hard error, because two manifests in one
 * package means two places for the next declaration to land and no rule saying
 * which. No `package.json` pointer: every other tool in this repo is found by
 * filename (`tsconfig.json`, `wrangler.jsonc`, `supadart.yaml`), and a pointer
 * would be the only one of its kind.
 *
 * One special case: `supabase/env.ts` sits at the repo root, OUTSIDE the
 * workspace globs. Its variables belong to `config.toml` and the Supabase
 * CLI, not to any package, so it lives next to the config that reads them.
 *
 * `@devdogsuga/env` itself (the package that exports `define()`/`declare()`)
 * no longer needs a special-case exclusion here: since the Backstage
 * cutover it is an installed npm dependency, not a workspace package under
 * `packages/`, so this scan never sees it at all.
 *
 * devtools' OWN operator manifest (this package's root `env.ts` — the keys
 * no app reads at all: `BWS_ACCESS_TOKEN`, `CLOUDFLARE_API_TOKEN`, and
 * friends) has the same problem in reverse: since the Backstage cutover
 * devtools is no longer one of the TARGET repo's workspace packages either,
 * so the scan below would never see it. It is loaded unconditionally,
 * always, regardless of which repo devtools is running against — see
 * `ownManifestPath()`'s own comment for how it stays resolvable both from a
 * workspace checkout and from an installed `pnpm dlx`/`node_modules` copy,
 * and for why loading it through the same `importRepoTs()` tsx path as
 * every other manifest (rather than a plain static `import`) is what keeps
 * its `declare()`/`define()` calls landing in the SAME `@devdogsuga/env`
 * registry instance the target repo's manifests populate (module identity —
 * see `repo/peers.ts`'s header and the devtools-dlx prototype's
 * FINDINGS.md experiment 3). Its bare `@devdogsuga/env` import is
 * redirected to the copy `loadEnv()` resolved through the repo, because
 * from a `pnpm dlx` copy the specifier does not resolve at all: devtools
 * ships no copy of its own (`@devdogsuga/env` is only ever an optional
 * peer), and nothing installs one next to it. See `repo/peer-redirect.ts`.
 *
 * Most workspace packages declare nothing, so "no env.ts found" means
 * not-a-manifest rather than an error.
 *
 * ⚠️ A Worker still needs a manifest, even though its bindings arrive as a
 * function argument rather than `process.env`: a manifest is the only thing
 * that routes a credential to a deployed environment and the only thing that
 * tells `env audit` a Worker secret is supposed to be there. Without one, a
 * minted secret (in no Bitwarden project by design) is reported as an orphan,
 * i.e. as safe for the §3.6 prune path to delete.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { redirectPeer } from "../repo/peer-redirect.js";
import { getEnvSync, loadEnv, repoPeerUrl } from "../repo/peers.js";
import { findRepoRoot } from "../repo/root.js";
import { importRepoTs } from "../repo/tsx-loader.js";
import { ownPackageDir } from "../version.js";

/**
 * The single in-flight (or settled) load.
 *
 * Node's module cache already makes a second `import()` of the same manifest a
 * no-op, but memoizing the whole pass is asserted here rather than inherited: a
 * future bundler or test runner that re-evaluates modules would duplicate every
 * declaration, and duplicated declarations are what the completeness test
 * treats as a bug. A failed load stays failed. Every later call gets the same
 * rejection, because retrying into a half-populated registry would hide the
 * manifest that broke.
 */
let loaded: Promise<void> | undefined;

/**
 * Imports every manifest so the registry populates. Idempotent; concurrent
 * callers share one pass. Await this before touching any derived selector.
 */
export function loadRegistry(): Promise<void> {
  loaded ??= importManifests();
  return loaded;
}

/**
 * Refuses to proceed on an empty registry.
 *
 * For SYNC consumers of the derived selectors (`selectForPush`, `routeTo`),
 * which cannot await the load themselves. An empty registry makes every
 * selector return `[]`, and `[]` fails open in the worst direction: nothing is
 * never-store, so `BWS_ACCESS_TOKEN` would upload. Better a crash naming the
 * missing call than a push that quietly stores the unstorable.
 */
export function assertRegistryLoaded(): void {
  if (getEnvSync().variables().size === 0) {
    throw new Error(
      "The env registry is empty — no manifest has been imported, so the " +
        "derived key sets would all be []. Await loadRegistry() (from " +
        "devtools' env/discovery.ts) before routing or selecting secrets.",
    );
  }
}

async function importManifests(): Promise<void> {
  // Warms `repo/peers.ts`'s sync cache before any manifest imports: each
  // manifest's own `declare()`/`define()` calls run against the SAME
  // `@devdogsuga/env` module instance this line resolves (module identity —
  // see `repo/peers.ts`'s header), and `assertRegistryLoaded()` /
  // `gh/environments.ts`'s getters read it back synchronously afterward.
  await loadEnv();

  // devtools' own manifest imports `@devdogsuga/env` by bare specifier, which
  // does not resolve at all from a `pnpm dlx` copy. Point it at the copy
  // `loadEnv()` just resolved through the repo. See `repo/peer-redirect.ts`.
  const envUrl = repoPeerUrl("@devdogsuga/env");
  if (envUrl) {
    redirectPeer({
      parentURL: pathToFileURL(ownManifestPath()).href,
      specifier: "@devdogsuga/env",
      url: envUrl,
    });
  }

  // The Next apps' manifests run `createEnv` at import time. Without this flag
  // they would validate the AMBIENT environment, a devtools process rather than
  // an app build, and throw on whatever is missing. The manifests already
  // short-circuit their `resolveEnvironment()` call under the flag, so setting
  // it here is the supported "read the declarations, skip the values" mode.
  // Restored afterward so a long-lived process (tests) does not keep validation
  // off for whatever runs next.
  const previous = process.env.SKIP_ENV_VALIDATION;
  process.env.SKIP_ENV_VALIDATION = "1";
  try {
    for (const path of manifestPaths()) {
      try {
        await importRepoTs(path);
      } catch (cause) {
        throw new Error(`The env manifest at ${path} failed to import.`, {
          cause,
        });
      }
    }
  } finally {
    if (previous === undefined) delete process.env.SKIP_ENV_VALIDATION;
    else process.env.SKIP_ENV_VALIDATION = previous;
  }
}

/**
 * Every manifest file, in a stable order.
 *
 * The workspace members are enumerated by scanning `apps/*` and `packages/*`
 * plus the literal `docs`, a deliberately boring mirror of the three globs in
 * `pnpm-workspace.yaml` rather than a YAML parse: the globs have not changed
 * since the workspace existed, devtools carries no YAML dependency, and a new
 * top-level glob would already mean editing more interesting files than this
 * one.
 */
function manifestPaths(): string[] {
  const paths: string[] = [];

  for (const dir of workspaceDirs()) {
    const manifest = manifestIn(dir);
    if (manifest) paths.push(manifest);
  }

  // The repo-root special case: not a workspace package, see the header.
  const supabase = manifestIn(join(findRepoRoot(), "supabase"));
  if (supabase) paths.push(supabase);

  // devtools' own operator manifest — always included, regardless of the
  // target repo. Last, matching where it sat back when devtools itself was
  // `packages/devtools` (alphabetically last of the packages this repo
  // ever had). `SECTION_ORDER` in `env/example.ts` fixes the RENDERED
  // section order independently of this insertion order, so this position
  // is cosmetic for `.env.example`; it still matters for which source
  // "wins" a shared key's declaration-order tie-break.
  paths.push(ownManifestPath());

  return paths;
}

/**
 * The absolute path to devtools' own `env.ts`, resolved relative to THIS
 * module's own file rather than the target repo — it ships alongside
 * `dist/` (see `package.json`'s `files`), not inside the target repo's
 * workspace, so `findRepoRoot()`/`workspaceDirs()` can never find it.
 *
 * The package root is `ownPackageDir()`: `env.ts` sits there, deliberately
 * outside `src/` (see that file's own header, and `tsconfig.typecheck.json`,
 * which includes it as a sibling of `src` for exactly that reason). Same file,
 * same relative shape, in both a workspace checkout
 * (`packages/devtools/env.ts`) and an installed copy
 * (`node_modules/@devdogsuga/devtools/env.ts`).
 */
function ownManifestPath(): string {
  return join(ownPackageDir(), "env.ts");
}

function workspaceDirs(): string[] {
  const dirs: string[] = [];
  const repoRoot = findRepoRoot();
  for (const parent of ["apps", "packages"]) {
    const names: string[] = [];
    for (const entry of readdirSync(join(repoRoot, parent), {
      withFileTypes: true,
    })) {
      // node_modules and dotfiles are not packages.
      if (!entry.isDirectory()) continue;
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      names.push(entry.name);
    }
    // Sorted, because readdir order is whatever the filesystem feels like and
    // registry insertion order is now OBSERVABLE: `env example` renders
    // keys in declaration order and CI byte-compares the result, so two
    // machines walking the same tree must import the same manifests in the
    // same sequence.
    names.sort();
    for (const name of names) dirs.push(join(repoRoot, parent, name));
  }
  dirs.push(join(repoRoot, "docs"));
  return dirs;
}

/** `src/env.ts`, then `env.ts`; both present in one package is a hard error. */
function manifestIn(dir: string): string | null {
  const inSrc = join(dir, "src", "env.ts");
  const atRoot = join(dir, "env.ts");
  const hasSrc = existsSync(inSrc);
  const hasRoot = existsSync(atRoot);

  if (hasSrc && hasRoot) {
    throw new Error(
      `${dir} has BOTH src/env.ts and env.ts. One package gets one manifest — ` +
        "two of them means two places for the next declaration to land, and " +
        "no rule saying which. Merge them.",
    );
  }
  return hasSrc ? inSrc : hasRoot ? atRoot : null;
}

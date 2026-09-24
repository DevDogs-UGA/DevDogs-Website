/**
 * The dlx-distribution preflight: fetches a tiny minimums manifest from
 * DevDogsUGA's `main` branch, compares it against this build's own version,
 * and decides whether to proceed, nudge, or self-refresh by re-exec'ing
 * `pnpm dlx @devdogsuga/devtools@<latest>`.
 *
 * Ported from the `devtools-dlx` prototype
 * (`/home/sloan/scratchpad/devdogs/prototypes/devtools-dlx/FINDINGS.md`,
 * experiment 7 and its "Recommended contract" section) — read that file for
 * why each design choice below is the one that survived testing rather than
 * the first thing that seemed reasonable:
 *
 *   - The re-exec spec MUST be an exact version (`@devdogsuga/devtools@0.4.2`),
 *     never a bare spec. Experiment 6 found TWO independent staleness
 *     mechanisms a bare spec (even with `dlx-cache-max-age=0`) does not
 *     reliably bypass: pnpm's dlx cache TTL, and pnpm 11's
 *     `minimumReleaseAge` cooldown on a just-published version. Only an
 *     exact pinned spec bypasses both.
 *   - `--config.registry=<url>`, not `--registry` after `dlx` — pnpm 11
 *     rejects the latter positioned there.
 *   - The manifest fetch fails open (log + proceed on the current version)
 *     on ANY error — dead host, timeout, malformed JSON, schema mismatch —
 *     so an offline contributor is never blocked by this check.
 *
 * `devtools-ci` (`launch-ci.ts`) never calls this module — CI pins an exact
 * version on purpose (see the carve-out plan's §9 Wave 2 decisions), and a
 * self-refreshing CI job would defeat that pin.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** Env var set on the re-exec'd child so a still-below-minimum child refuses
 * to loop a second time instead of re-exec'ing forever. */
const LOOP_GUARD_ENV = "DEVTOOLS_REEXEC_GUARD";

/** Default location of the manifest — a repo-root file in DevDogsUGA's own
 * `main` branch, not buried inside a package, so it survives reorganization
 * and is a trivial hotfix-PR edit. Overridable for tests and for use before
 * the file exists on the real remote. */
const DEFAULT_MINIMUMS_URL =
  "https://raw.githubusercontent.com/DevDogsUGA/DevDogsUGA/main/devtools-minimums.json";

const FETCH_TIMEOUT_MS = 1500;

/**
 * Deliberately short — 10 minutes, not the plan's original "a few hours" —
 * so a mid-meeting hotfix (someone drops the `minimum` to force a
 * self-refresh) propagates to every contributor's next command within one
 * coffee break, not one workday. This is the one place stage A2 knowingly
 * overrides §5's original wording; see the carve-out plan's §9 note.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;

const ManifestSchema = z.object({
  devtools: z.object({
    latest: z.string().min(1),
    minimum: z.string().min(1),
  }),
});

export type DevtoolsMinimumsManifest = z.infer<typeof ManifestSchema>;

function xdgCacheHome(): string {
  const fromEnv = process.env.XDG_CACHE_HOME;
  return fromEnv !== undefined && fromEnv !== "" ? fromEnv : join(homedir(), ".cache");
}

/** Exported so tests can point elsewhere without touching the real `~/.cache`. */
export function cacheFilePath(): string {
  return join(xdgCacheHome(), "devdogsuga-devtools", "minimums.json");
}

interface CacheEntry {
  fetchedAt: number;
  url: string;
  manifest: DevtoolsMinimumsManifest;
}

function readCache(url: string): DevtoolsMinimumsManifest | null {
  const file = cacheFilePath();
  if (!existsSync(file)) return null;
  try {
    const entry = JSON.parse(readFileSync(file, "utf8")) as CacheEntry;
    if (entry.url !== url) return null;
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    const parsed = ManifestSchema.safeParse(entry.manifest);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeCache(url: string, manifest: DevtoolsMinimumsManifest): void {
  try {
    const file = cacheFilePath();
    mkdirSync(dirname(file), { recursive: true });
    const entry: CacheEntry = { fetchedAt: Date.now(), url, manifest };
    writeFileSync(file, JSON.stringify(entry));
  } catch {
    // Best-effort. A cache write failure (read-only home dir, full disk,
    // whatever) must never fail the command it is only trying to speed up
    // next time.
  }
}

export interface ManifestResult {
  manifest: DevtoolsMinimumsManifest | null;
  source: "cache" | "network" | "fail-open";
  error?: string;
}

/**
 * Fetches (or reads the disk cache for) the minimums manifest. Never
 * throws: any failure — timeout, network error, non-200, invalid JSON,
 * schema mismatch — comes back as `{ manifest: null, source: "fail-open" }`.
 */
export async function fetchManifest(options?: {
  url?: string;
  skipCache?: boolean;
  timeoutMs?: number;
}): Promise<ManifestResult> {
  const url = options?.url ?? process.env.DEVTOOLS_MINIMUMS_URL ?? DEFAULT_MINIMUMS_URL;
  const timeoutMs = options?.timeoutMs ?? FETCH_TIMEOUT_MS;

  if (options?.skipCache !== true) {
    const cached = readCache(url);
    if (cached) return { manifest: cached, source: "cache" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`manifest fetch: HTTP ${res.status}`);
    const json = await res.json();
    const parsed = ManifestSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`manifest fetch: invalid shape (${parsed.error.message})`);
    }
    writeCache(url, parsed.data);
    return { manifest: parsed.data, source: "network" };
  } catch (err) {
    return { manifest: null, source: "fail-open", error: errorText(err) };
  } finally {
    clearTimeout(timer);
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Three-part semver comparison; `<0` means `a` is older than `b`. Anything
 * non-numeric in a segment sorts as `0`, which is permissive on purpose —
 * this only ever compares two well-formed manifest/package versions. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export type PreflightAction =
  | { action: "skip-preflight" }
  | { action: "dev-mode" }
  | { action: "fail-open"; reason: string }
  | { action: "self-refresh"; from: string; to: string; source: ManifestResult["source"] }
  | { action: "loop-guard-tripped"; detail: string }
  | { action: "nudge"; from: string; to: string; source: ManifestResult["source"] }
  | { action: "up-to-date"; source: ManifestResult["source"] };

export interface PreflightOptions {
  currentVersion: string;
  argv: readonly string[];
  skipPreflight: boolean;
  refresh: boolean;
  registry?: string;
  manifestUrl?: string;
  devMode?: boolean;
}

/**
 * Runs the decision half of preflight. Does not itself re-exec or print —
 * `runPreflight` below does both, so the pure decision stays independently
 * testable (loop guard, fail-open, version comparisons) without spawning a
 * real child process in every test.
 */
export async function decidePreflight(options: PreflightOptions): Promise<PreflightAction> {
  if (options.skipPreflight) return { action: "skip-preflight" };
  if (options.devMode === true) return { action: "dev-mode" };

  const { manifest, source, error } = await fetchManifest({
    url: options.manifestUrl,
    skipCache: options.refresh,
  });

  if (!manifest) {
    return { action: "fail-open", reason: error ?? "unknown error" };
  }

  const { latest, minimum } = manifest.devtools;

  if (compareVersions(options.currentVersion, minimum) < 0) {
    if (process.env[LOOP_GUARD_ENV]) {
      return {
        action: "loop-guard-tripped",
        detail: `already re-exec'd once (${LOOP_GUARD_ENV}=${process.env[LOOP_GUARD_ENV]}); refusing to loop again`,
      };
    }
    return { action: "self-refresh", from: options.currentVersion, to: latest, source };
  }

  if (compareVersions(options.currentVersion, latest) < 0) {
    return { action: "nudge", from: options.currentVersion, to: latest, source };
  }

  return { action: "up-to-date", source };
}

/**
 * Re-execs as the exact pinned `version`, inheriting stdio and propagating
 * the child's exit code. Never returns — the caller relies on this to end
 * the process, matching `spawnSync`'s synchronous nature (there is nothing
 * meaningful left to do in this process either way).
 *
 * Exported separately from `runPreflight` so tests can stub it instead of
 * spawning a real `pnpm dlx`.
 */
export function selfRefresh(options: {
  version: string;
  argv: readonly string[];
  registry?: string;
}): never {
  const spec = `@devdogsuga/devtools@${options.version}`;
  const registryArgs =
    options.registry !== undefined ? [`--config.registry=${options.registry}`] : [];
  const result = spawnSync("pnpm", ["dlx", ...registryArgs, spec, ...options.argv], {
    stdio: "inherit",
    env: { ...process.env, [LOOP_GUARD_ENV]: "1" },
  });
  process.exit(result.status ?? 1);
}

/**
 * The full preflight: decides, prints the single line each outcome calls
 * for (or nothing, for the common `up-to-date`/`skip-preflight`/`dev-mode`
 * cases — see each branch), and re-execs on `self-refresh`. Returns once
 * for every other outcome so `launch()` can continue dispatching the
 * original command.
 */
export async function runPreflight(
  options: PreflightOptions & { reexec?: typeof selfRefresh },
): Promise<PreflightAction> {
  const decision = await decidePreflight(options);
  const reexec = options.reexec ?? selfRefresh;

  switch (decision.action) {
    case "skip-preflight":
    case "dev-mode":
    case "up-to-date":
      // Silent — see the module header: this runs on every command, and a
      // line of noise on the overwhelmingly common "nothing to do" path
      // would defeat the point of the check running unconditionally.
      break;
    case "fail-open":
      process.stderr.write(`devtools: preflight check skipped (${decision.reason})\n`);
      break;
    case "loop-guard-tripped":
      process.stderr.write(
        `devtools: still below the minimum version after one self-refresh attempt; ` +
          `continuing on the current version instead of looping (${decision.detail})\n`,
      );
      break;
    case "nudge":
      process.stderr.write(
        `devtools: a newer version (${decision.to}) is available — you're on ${decision.from}. ` +
          `Run with --refresh, or it'll catch up on its own shortly.\n`,
      );
      break;
    case "self-refresh":
      process.stderr.write(
        `devtools: ${decision.from} is below the minimum supported version — ` +
          `relaunching as ${decision.to}...\n`,
      );
      reexec({ version: decision.to, argv: options.argv, registry: options.registry });
      break;
  }

  return decision;
}

let cachedOwnDir: string | undefined;

/** The directory this module's compiled file lives in one level under —
 * i.e. the devtools package's own root (`dist/repo/preflight.js` → up two).
 * Exported for tests; memoized since it never changes within a process. */
export function ownPackageDir(): string {
  if (cachedOwnDir === undefined) {
    cachedOwnDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  }
  return cachedOwnDir;
}

/** Reads this build's own `package.json` — the version preflight compares
 * against the manifest, and the value dev-mode detection inspects. */
export function ownVersion(): string {
  const pkg = JSON.parse(readFileSync(join(ownPackageDir(), "package.json"), "utf8")) as {
    version?: unknown;
  };
  return typeof pkg.version === "string" ? pkg.version : "0.0.0";
}

/**
 * True when this devtools is running from a workspace/dev checkout rather
 * than a published install — a `pnpm build && node ./bin/devtools.mjs` run
 * inside `Backstage/packages/devtools` itself, or any other case where the
 * package's own directory is not sitting under a `node_modules` tree (a
 * real install — via dlx's isolated cache or an ordinary `node_modules` —
 * always puts it under one). `version: "0.0.0-dev"` is the explicit,
 * unambiguous override for anything that wants to force this (a fixture,
 * an integration test); the path heuristic is the sensible default so
 * nobody has to remember to set it.
 */
export function isDevMode(version: string = ownVersion(), dir: string = ownPackageDir()): boolean {
  if (version === "0.0.0-dev") return true;
  const marker = `${sep}node_modules${sep}`;
  return !dir.includes(marker);
}

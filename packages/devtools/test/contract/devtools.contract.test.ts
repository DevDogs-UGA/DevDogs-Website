/**
 * devtools' contract tests: the carve-out plan's §8 risk mitigation ("devtools
 * CI must run its own contract tests against a fixture repo before publish").
 *
 * Unlike the unit suite (`src/**\/*.test.ts`, `pnpm test`), these do not mock
 * the filesystem or `findRepoRoot()` — they `pnpm pack` the real package,
 * install the real tarball into a temp copy of the committed fixture repo
 * (`test/fixture-repo/`, a minimal DevDogsUGA-shaped pnpm workspace), and run
 * the real `bin/devtools.mjs` as a subprocess against it. This is the closest
 * thing to "does a fresh `pnpm dlx @devdogsuga/devtools` actually work" that
 * can run without a real npm publish.
 *
 * Slow (a real `pnpm install` per run) and network-touching (the fixture's
 * OWN transitive dependencies — zod, @sentry/node, tsx, etc. — resolve
 * normally; only `@devdogsuga/*` packages are pinned to local tarballs via
 * `pnpm.overrides`, so nothing `@devdogsuga`-scoped ever reaches a real
 * registry). That is why this is `pnpm test:contract`, not part of the
 * default `pnpm test` — see package.json.
 *
 * PREREQUISITE: `pnpm --filter @devdogsuga/devtools build` (and the same for
 * `@devdogsuga/telemetry` and `@devdogsuga/env`) must already have produced
 * `dist/` for each — this suite packs whatever is currently on disk, it does
 * not build. CI's `ci.yaml`/`publish.yaml` both run the build step first;
 * see this repo's root README or those workflow files for the exact order.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Serves `json` at `/minimums.json` on an ephemeral local port for the
 * duration of `fn`, since `fetch()` has no `file://` support to fall back
 * on (confirmed: Node's built-in fetch rejects it outright) — this is the
 * one real HTTP round-trip in the whole suite, entirely loopback. */
async function withManifestServer<T>(
  json: unknown,
  fn: (url: string) => Promise<T> | T,
): Promise<T> {
  const server: Server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(json));
  });
  const url = await new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve(`http://127.0.0.1:${port}/minimums.json`);
    });
  });
  try {
    return await fn(url);
  } finally {
    server.close();
  }
}

const HERE = dirname(fileURLToPath(import.meta.url));
const DEVTOOLS_ROOT = join(HERE, "..", "..");
const BACKSTAGE_ROOT = join(DEVTOOLS_ROOT, "..", "..");
const FIXTURE_SRC = join(DEVTOOLS_ROOT, "test", "fixture-repo");

const PACK_TIMEOUT_MS = 60_000;
const INSTALL_TIMEOUT_MS = 5 * 60_000;
const RUN_TIMEOUT_MS = 30_000;

function requireBuilt(pkgDir: string, entry: string): void {
  const path = join(pkgDir, "dist", entry);
  if (!existsSync(path)) {
    throw new Error(
      `${path} does not exist. Run \`pnpm --filter ${pkgDir} build\` (or ` +
        `\`pnpm build\` from the Backstage root) before \`pnpm test:contract\`.`,
    );
  }
}

/** `pnpm pack`s a workspace package into `destDir`, returning the tarball's
 * absolute path. Uses `pnpm pack` (not `npm pack`) so `workspace:`/`catalog:`
 * specifiers are rewritten to resolved versions, matching what a real
 * publish would produce — same mechanism `scripts/pack-local.mjs` uses. */
function packPackage(pkgDir: string, destDir: string): string {
  const output = execFileSync(
    "pnpm",
    ["pack", "--pack-destination", destDir],
    { cwd: pkgDir, encoding: "utf8" },
  );
  // `pnpm pack`'s last non-empty stdout line is the tarball's full absolute
  // path already (NOT a bare filename — `join`ing it with `destDir` again
  // here double-prefixes the path, since `path.join` does not treat a
  // leading-slash second argument as absolute; confirmed the hard way).
  const lines = output.trim().split("\n").filter(Boolean);
  return lines[lines.length - 1]!.trim();
}

describe("devtools contract tests", () => {
  let tmpRoot: string;
  let packDir: string;
  let fixtureDir: string;
  let devtoolsBin: string;

  beforeAll(() => {
    requireBuilt(DEVTOOLS_ROOT, "launch.js");
    requireBuilt(join(BACKSTAGE_ROOT, "packages", "telemetry"), "index.js");
    requireBuilt(join(BACKSTAGE_ROOT, "packages", "env"), "index.js");

    tmpRoot = mkdtempSync(join(tmpdir(), "devtools-contract-"));
    packDir = join(tmpRoot, "packs");
    mkdirSync(packDir, { recursive: true });

    const devtoolsTgz = packPackage(DEVTOOLS_ROOT, packDir);
    const telemetryTgz = packPackage(join(BACKSTAGE_ROOT, "packages", "telemetry"), packDir);
    const envTgz = packPackage(join(BACKSTAGE_ROOT, "packages", "env"), packDir);

    fixtureDir = join(tmpRoot, "fixture-repo");
    cpSync(FIXTURE_SRC, fixtureDir, { recursive: true });

    // Point every @devdogsuga/* dependency the fixture (transitively) needs
    // at the tarballs just packed, instead of a real registry — the same
    // "local-pack bridge" pattern CUTOVER.md documents for the real
    // DevDogsUGA cutover, applied here to a throwaway fixture. `devtools`
    // itself is added as a root dependency so `pnpm install` places
    // `node_modules/.bin/devtools`, the real published entry point.
    const rootPkgPath = join(fixtureDir, "package.json");
    const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8")) as Record<string, unknown>;
    rootPkg.dependencies = { "@devdogsuga/devtools": `file:${devtoolsTgz}` };
    writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2));

    // pnpm 11 moved `overrides` (and the allow-scripts decision map) out of
    // package.json's `pnpm` key and into `pnpm-workspace.yaml` — a
    // `package.json.pnpm.overrides` entry is silently ignored with a
    // warning now, not an error, which is its own trap: it LOOKS like it
    // worked. `allowBuilds` mirrors Backstage's own root
    // `pnpm-workspace.yaml` (this fixture pulls in `esbuild`/`core-js`
    // transitively the same way).
    const workspaceYamlPath = join(fixtureDir, "pnpm-workspace.yaml");
    const workspaceYaml = readFileSync(workspaceYamlPath, "utf8");
    writeFileSync(
      workspaceYamlPath,
      `${workspaceYaml}\noverrides:\n` +
        `  "@devdogsuga/telemetry": "file:${telemetryTgz}"\n` +
        `  "@devdogsuga/env": "file:${envTgz}"\n` +
        `allowBuilds:\n` +
        `  core-js: false\n` +
        `  esbuild: true\n`,
    );

    const install = spawnSync("pnpm", ["install", "--no-frozen-lockfile"], {
      cwd: fixtureDir,
      encoding: "utf8",
      timeout: INSTALL_TIMEOUT_MS,
    });
    if (install.status !== 0) {
      throw new Error(
        `pnpm install in the fixture failed (status ${install.status}):\n` +
          `${install.stdout}\n${install.stderr}`,
      );
    }

    devtoolsBin = join(fixtureDir, "node_modules", ".bin", "devtools");
    if (!existsSync(devtoolsBin)) {
      throw new Error(`${devtoolsBin} was not created by the fixture install.`);
    }
  }, INSTALL_TIMEOUT_MS + 2 * PACK_TIMEOUT_MS);

  afterAll(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  });

  /**
   * Runs the real installed `devtools` bin as a subprocess. Deliberately
   * ASYNC (`spawn`, not `spawnSync`): the preflight tests below run a real
   * loopback HTTP server IN THIS SAME TEST PROCESS
   * (`withManifestServer`) that the child needs to reach — `spawnSync`
   * blocks this process's entire event loop until the child exits, which
   * would prevent that in-process server from ever accepting the child's
   * connection. Confirmed the hard way: with `spawnSync`, every preflight
   * fetch against the in-process server hung for the full 1.5s timeout and
   * failed open, even though the identical server answered a totally
   * separate process instantly.
   */
  function run(
    args: string[],
    options?: { cwd?: string; env?: Record<string, string> },
  ): Promise<{ status: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(devtoolsBin, args, {
        cwd: options?.cwd ?? fixtureDir,
        env: {
          ...process.env,
          DEVTOOLS_SKIP_PREFLIGHT: "1",
          ...options?.env,
        },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`devtools bin timed out after ${RUN_TIMEOUT_MS}ms: ${args.join(" ")}`));
      }, RUN_TIMEOUT_MS);
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (status) => {
        clearTimeout(timer);
        resolve({ status, stdout, stderr });
      });
    });
  }

  /**
   * Like `run`, but resolves (killing the child) the moment its
   * accumulated stderr contains `marker`, instead of waiting for the
   * process to exit on its own — for the one case (the re-exec decision
   * below) where the child's own eventual exit is both doomed and slow.
   */
  function runUntilStderrContains(
    args: string[],
    env: Record<string, string>,
    marker: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(devtoolsBin, args, {
        cwd: fixtureDir,
        env: { ...process.env, DEVTOOLS_SKIP_PREFLIGHT: "1", ...env },
      });
      let stderr = "";
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill("SIGKILL");
        fn();
      };
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
        if (stderr.includes(marker)) finish(() => resolve(stderr));
      });
      const timer = setTimeout(() => {
        finish(() =>
          reject(
            new Error(
              `"${marker}" never appeared in stderr within ${RUN_TIMEOUT_MS}ms. ` +
                `stderr so far:\n${stderr}`,
            ),
          ),
        );
      }, RUN_TIMEOUT_MS);
      child.on("error", (err) => finish(() => reject(err)));
      child.on("close", () => finish(() => resolve(stderr)));
    });
  }

  it("--help works from the fixture root", async () => {
    const { status, stdout } = await run(["--help"]);
    expect(status).toBe(0);
    expect(stdout).toContain("pnpm devtools [command] [options]");
  });

  it("--help works from OUTSIDE any repo (no fixture cwd)", async () => {
    const { status, stdout } = await run(["--help"], { cwd: tmpdir() });
    expect(status).toBe(0);
    expect(stdout).toContain("pnpm devtools [command] [options]");
  });

  it("cron list discovers the fixture's real wrangler config and scheduled.ts", async () => {
    const { status, stdout } = await run(["cron", "list", "--tier", "development"]);
    expect(status).toBe(0);
    expect(stdout).toContain("demo-app");
    expect(stdout).toContain("*/30 * * * *");
    expect(stdout).toContain("Demo sync (every 30 minutes)");
  });

  it("cron list resolves the fixture's production override too", async () => {
    const { status, stdout } = await run(["cron", "list", "--tier", "development"]);
    expect(status).toBe(0);
    // Both tiers print in one `cron list` call (see cron/commands.ts); the
    // production cron comes from wrangler.jsonc's env.production override.
    expect(stdout).toContain("0 6 * * *");
    expect(stdout).toContain("production");
  });

  it("env example writes .env.example from the fixture's real env.ts manifest, exercising module identity", async () => {
    const { status, stdout } = await run(["env", "example", "--tier", "development"]);
    expect(status).toBe(0);
    expect(stdout.toLowerCase()).toContain("wrote");
    const written = readFileSync(join(fixtureDir, ".env.example"), "utf8");
    // Both the secret (server-only) and public (client) keys the fixture's
    // env.ts declared via define()/declare() — proof the registry actually
    // populated from a real dynamic import, not a mock.
    expect(written).toContain("DEMO_API_KEY");
    expect(written).toContain("DEMO_PUBLIC_URL");
  });

  it("root discovery works from a nested subdirectory", async () => {
    const nested = join(fixtureDir, "apps", "demo-app", "cloudflare");
    const { status, stdout } = await run(["cron", "list", "--tier", "development"], {
      cwd: nested,
    });
    expect(status).toBe(0);
    expect(stdout).toContain("demo-app");
  });

  it("refuses with the clear not-in-a-repo error outside any checkout", async () => {
    const { status, stderr } = await run(["cron", "list", "--tier", "development"], {
      cwd: tmpdir(),
    });
    expect(status).not.toBe(0);
    expect(stderr).toContain("run this from inside a DevDogsUGA clone");
  });

  describe("preflight", () => {
    it("fails open against a dead manifest URL and still runs the command", async () => {
      const { status, stdout } = await run(["cron", "list", "--tier", "development"], {
        env: {
          DEVTOOLS_MINIMUMS_URL: "http://127.0.0.1:1/nope.json",
          DEVTOOLS_SKIP_PREFLIGHT: "", // this block tests preflight itself
        },
      });
      expect(status).toBe(0);
      expect(stdout).toContain("demo-app");
      // Fails open silently-or-one-dim-line, per repo/preflight.ts's header
      // — either is acceptable; the real assertion is that the command
      // still ran to completion despite the dead URL.
    });

    it("nudges (without refusing) when behind latest but at/above minimum", async () => {
      await withManifestServer(
        { devtools: { latest: "99.0.0", minimum: "0.0.0" } },
        async (url) => {
          const { status, stderr } = await run(["cron", "list", "--tier", "development"], {
            env: { DEVTOOLS_MINIMUMS_URL: url, DEVTOOLS_SKIP_PREFLIGHT: "" },
          });
          expect(status).toBe(0);
          expect(stderr).toContain("newer version");
        },
      );
    });

    it("decides to re-exec when below minimum (spawn pointed at an unreachable registry, so the decision is observable without waiting for a real dlx round-trip to fail)", async () => {
      await withManifestServer(
        { devtools: { latest: "99.0.0", minimum: "99.0.0" } },
        async (url) => {
          // `pnpm dlx --config.registry=<dead port>` does not fail fast —
          // confirmed it hangs 40s+ retrying rather than an immediate
          // ECONNREFUSED, which is far too slow for a test to wait out. So
          // this reads stderr as it streams and resolves (killing the
          // child) the moment the RE-EXEC DECISION line appears, rather
          // than waiting for the doomed child `pnpm dlx` call to actually
          // finish. The unit suite (`src/repo/preflight.test.ts`) covers
          // the decision logic itself with an injected `reexec` stub; this
          // is the subprocess-level confirmation that `launch()` really
          // wires it up and attempts the real spawn.
          const stderr = await runUntilStderrContains(
            ["cron", "list", "--tier", "development"],
            {
              DEVTOOLS_MINIMUMS_URL: url,
              DEVTOOLS_SKIP_PREFLIGHT: "",
              DEVTOOLS_REGISTRY: "http://127.0.0.1:1",
            },
            "relaunching as 99.0.0",
          );
          expect(stderr).toContain("below the minimum supported version");
          expect(stderr).toContain("relaunching as 99.0.0");
        },
      );
    });

    it("--skip-preflight bypasses the check entirely, even below minimum", async () => {
      await withManifestServer(
        { devtools: { latest: "99.0.0", minimum: "99.0.0" } },
        async (url) => {
          const { status, stdout } = await run(
            ["cron", "list", "--tier", "development", "--skip-preflight"],
            { env: { DEVTOOLS_MINIMUMS_URL: url, DEVTOOLS_SKIP_PREFLIGHT: "" } },
          );
          expect(status).toBe(0);
          expect(stdout).toContain("demo-app");
        },
      );
    });
  });
});

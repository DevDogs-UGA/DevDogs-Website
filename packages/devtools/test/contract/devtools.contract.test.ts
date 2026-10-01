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
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  cpSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
  const output = execFileSync("pnpm", ["pack", "--pack-destination", destDir], {
    cwd: pkgDir,
    encoding: "utf8",
  });
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
  let dlxBin: string;

  beforeAll(
    () => {
      requireBuilt(DEVTOOLS_ROOT, "launch.js");
      requireBuilt(join(BACKSTAGE_ROOT, "packages", "telemetry"), "index.js");
      requireBuilt(join(BACKSTAGE_ROOT, "packages", "env"), "index.js");

      tmpRoot = mkdtempSync(join(tmpdir(), "devtools-contract-"));
      packDir = join(tmpRoot, "packs");
      mkdirSync(packDir, { recursive: true });

      const devtoolsTgz = packPackage(DEVTOOLS_ROOT, packDir);
      const telemetryTgz = packPackage(
        join(BACKSTAGE_ROOT, "packages", "telemetry"),
        packDir,
      );
      const envTgz = packPackage(
        join(BACKSTAGE_ROOT, "packages", "env"),
        packDir,
      );

      fixtureDir = join(tmpRoot, "fixture-repo");
      cpSync(FIXTURE_SRC, fixtureDir, { recursive: true });

      // Point every @devdogsuga/* dependency the fixture (transitively) needs
      // at the tarballs just packed, instead of a real registry — the same
      // "local-pack bridge" pattern CUTOVER.md documents for the real
      // DevDogsUGA cutover, applied here to a throwaway fixture. `devtools`
      // itself is added as a root dependency so `pnpm install` places
      // `node_modules/.bin/devtools`, the real published entry point.
      const rootPkgPath = join(fixtureDir, "package.json");
      const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8")) as Record<
        string,
        unknown
      >;
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
        throw new Error(
          `${devtoolsBin} was not created by the fixture install.`,
        );
      }

      // A second install of the same tarball OUTSIDE the fixture, the shape
      // `pnpm dlx` gives a real run: devtools alone in its own directory, with
      // no `@devdogsuga/env` installed next to it (an optional peer nothing
      // here depends on). The fixture install above cannot catch a bare peer
      // import from devtools' own files, because the fixture supplies the peer.
      const dlxDir = join(tmpRoot, "dlx");
      mkdirSync(dlxDir);
      writeFileSync(
        join(dlxDir, "package.json"),
        JSON.stringify({
          name: "dlx",
          private: true,
          dependencies: { "@devdogsuga/devtools": `file:${devtoolsTgz}` },
        }),
      );
      writeFileSync(
        join(dlxDir, "pnpm-workspace.yaml"),
        `overrides:\n` +
          `  "@devdogsuga/telemetry": "file:${telemetryTgz}"\n` +
          `allowBuilds:\n` +
          `  core-js: false\n` +
          `  esbuild: true\n`,
      );
      const dlxInstall = spawnSync(
        "pnpm",
        ["install", "--no-frozen-lockfile"],
        {
          cwd: dlxDir,
          encoding: "utf8",
          timeout: INSTALL_TIMEOUT_MS,
        },
      );
      if (dlxInstall.status !== 0) {
        throw new Error(
          `pnpm install in the dlx directory failed (status ${dlxInstall.status}):\n` +
            `${dlxInstall.stdout}\n${dlxInstall.stderr}`,
        );
      }
      if (existsSync(join(dlxDir, "node_modules", "@devdogsuga", "env"))) {
        throw new Error(
          "The dlx directory installed @devdogsuga/env, so it no longer models pnpm dlx.",
        );
      }
      dlxBin = join(dlxDir, "node_modules", ".bin", "devtools");
    },
    2 * INSTALL_TIMEOUT_MS + 2 * PACK_TIMEOUT_MS,
  );

  afterAll(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  });

  /** Runs the real installed `devtools` bin as a subprocess, returning once
   * it exits. */
  function run(
    args: string[],
    options?: { cwd?: string; env?: Record<string, string>; bin?: string },
  ): Promise<{ status: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(options?.bin ?? devtoolsBin, args, {
        cwd: options?.cwd ?? fixtureDir,
        env: {
          ...process.env,
          ...options?.env,
        },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(
          new Error(
            `devtools bin timed out after ${RUN_TIMEOUT_MS}ms: ${args.join(" ")}`,
          ),
        );
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

  it("ships a bundle with the private core inlined", () => {
    // `@devdogsuga/cli-core` is a `workspace:*` devDependency that is never
    // published, so any import of it left in `dist/` would fail on a real
    // install. tsdown inlines it; this proves the packed tarball agrees.
    const dist = join(
      fixtureDir,
      "node_modules",
      "@devdogsuga",
      "devtools",
      "dist",
    );
    const files = readdirSync(dist).filter((name) => name.endsWith(".js"));
    expect(files).toContain("launch.js");
    const importsCore = /(?:from|import\()\s*["']@devdogsuga\/cli-core/;
    for (const name of files) {
      const imported = importsCore.test(readFileSync(join(dist, name), "utf8"));
      expect(imported, `${name} imports the private core`).toBe(false);
    }
  });

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
    const { status, stdout } = await run([
      "cron",
      "list",
      "--tier",
      "development",
    ]);
    expect(status).toBe(0);
    expect(stdout).toContain("demo-app");
    expect(stdout).toContain("*/30 * * * *");
    expect(stdout).toContain("Demo sync (every 30 minutes)");
  });

  it("cron list resolves the fixture's production override too", async () => {
    const { status, stdout } = await run([
      "cron",
      "list",
      "--tier",
      "development",
    ]);
    expect(status).toBe(0);
    // Both tiers print in one `cron list` call (see cron/commands.ts); the
    // production cron comes from wrangler.jsonc's env.production override.
    expect(stdout).toContain("0 6 * * *");
    expect(stdout).toContain("production");
  });

  it("env example writes .env.example from the fixture's real env.ts manifest, exercising module identity", async () => {
    const { status, stdout } = await run([
      "env",
      "example",
      "--tier",
      "development",
    ]);
    expect(status).toBe(0);
    expect(stdout.toLowerCase()).toContain("wrote");
    const written = readFileSync(join(fixtureDir, ".env.example"), "utf8");
    // Both the secret (server-only) and public (client) keys the fixture's
    // env.ts declared via define()/declare() — proof the registry actually
    // populated from a real dynamic import, not a mock.
    expect(written).toContain("DEMO_API_KEY");
    expect(written).toContain("DEMO_PUBLIC_URL");
  });

  it("env example loads devtools' own manifest from a dlx-shaped install", async () => {
    // Regression: devtools' `env.ts` imports `@devdogsuga/env` by bare
    // specifier, which does not resolve next to a dlx copy; every env
    // command failed with "The env manifest at .../env.ts failed to import".
    const { status, stdout, stderr } = await run(
      ["env", "example", "--tier", "development"],
      {
        bin: dlxBin,
      },
    );
    expect(stderr).not.toContain("failed to import");
    expect(status).toBe(0);
    expect(stdout.toLowerCase()).toContain("wrote");
    const written = readFileSync(join(fixtureDir, ".env.example"), "utf8");
    expect(written).toContain("DEMO_API_KEY");
    // Declared only in devtools' own manifest.
    expect(written).toContain("CLOUDFLARE_API_TOKEN");
  });

  it("root discovery works from a nested subdirectory", async () => {
    const nested = join(fixtureDir, "apps", "demo-app", "cloudflare");
    const { status, stdout } = await run(
      ["cron", "list", "--tier", "development"],
      {
        cwd: nested,
      },
    );
    expect(status).toBe(0);
    expect(stdout).toContain("demo-app");
  });

  it("refuses with the clear not-in-a-repo error outside any checkout", async () => {
    const { status, stderr } = await run(
      ["cron", "list", "--tier", "development"],
      {
        cwd: tmpdir(),
      },
    );
    expect(status).not.toBe(0);
    expect(stderr).toContain("run this from inside a DevDogsUGA clone");
  });
});

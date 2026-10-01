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
          // Failure logs go in the temp dir, never the real home.
          DEVTOOLS_LOG_DIR: join(tmpRoot, "default-logs"),
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

  it("refuses to guess a tier when nobody can answer", async () => {
    // The harness has no TTY, so this is the non-interactive path.
    const { status, stderr } = await run(["cron", "list"], {
      env: { DEPLOY_ENV: "", DEV_DB: "", CI: "" },
    });
    expect(status).toBe(1);
    expect(stderr).toContain("no tier named");
  });

  it("refuses production without --yes before the tool is ever started", async () => {
    // --no-env: there is no production env file in the fixture, and the gate
    // must not depend on one.
    const { status, stderr } = await run(
      ["--no-env", "--tier", "production", "supabase", "db", "push"],
      { env: { CI: "" } },
    );
    expect(status).toBe(1);
    expect(stderr).toContain("without --yes");
    expect(stderr).not.toContain("Ran:");
  });

  it("--no-env runs a command against a named tier without loading any env file", async () => {
    const { status, stdout, stderr } = await run(
      ["--no-env", "--tier", "development", "cron", "list"],
      { env: { CI: "true" } },
    );
    expect(status).toBe(0);
    expect(stdout).toContain("demo-app");
    expect(stderr).not.toContain("loaded");
  });

  it("prints no banner without a terminal", async () => {
    const { status, stdout } = await run(
      ["env", "example", "--tier", "development"],
      { env: { CI: "true" } },
    );
    expect(status).toBe(0);
    expect(stdout).not.toContain("DevDogs devtools");
  });

  // ── --help --json ──────────────────────────────────────────────────────────

  it("--help --json lists every command path, from outside any repo", async () => {
    const { status, stdout } = await run(["--help", "--json"], {
      cwd: tmpdir(),
    });
    expect(status).toBe(0);

    const doc = JSON.parse(stdout) as {
      version: string;
      commands: { path: string; surface: string; deprecated?: string }[];
    };
    const byPath = new Map(doc.commands.map((c) => [c.path, c]));
    for (const path of [
      "setup",
      "doctor",
      "check migrations",
      "check env",
      "check workers",
      "check scripts",
      "supabase",
      "preset apply-migrations",
      "cron run",
    ]) {
      expect(byPath.has(path), path).toBe(true);
    }
    // The aliases kept for DevDogsUGA's main say what replaces them.
    expect(byPath.get("db start")?.deprecated).toContain("supabase start");
    expect(byPath.get("run")?.deprecated).toContain("pnpm -r run");
    // Hidden from the wizard, but still a supported command.
    expect(byPath.get("completions")?.surface).toBe("cli-only");
    // Gone.
    for (const path of [
      "persona",
      "moderation check",
      "db reset",
      "cf build",
    ]) {
      expect(byPath.has(path), path).toBe(false);
    }
  });

  // ── check ──────────────────────────────────────────────────────────────────

  /** Rewrites a fixture file for the length of `body`, then puts it back. */
  async function withFile(
    path: string,
    text: string,
    body: () => Promise<void>,
  ): Promise<void> {
    const file = join(fixtureDir, path);
    const original = readFileSync(file, "utf8");
    writeFileSync(file, text);
    try {
      await body();
    } finally {
      writeFileSync(file, original);
    }
  }

  it("check workers passes when workers.json, wrangler.jsonc and the deploy matrix agree", async () => {
    const { status, stdout, stderr } = await run(["check", "workers"], {
      env: { CI: "true" },
    });
    expect(stderr).toBe("");
    expect(status).toBe(0);
    expect(stdout).toContain("check workers: in step.");
  });

  it("check workers names the drift and exits 1", async () => {
    await withFile("workers.json", "[]", async () => {
      const { status, stderr } = await run(["check", "workers"], {
        env: { CI: "true" },
      });
      expect(status).toBe(1);
      expect(stderr).toContain(
        "apps/demo-app has a wrangler.jsonc but is not in workers.json.",
      );
    });
  });

  it("check scripts passes on the fixture and refuses a script outside the vocabulary", async () => {
    const ok = await run(["check", "scripts"], { env: { CI: "true" } });
    expect(ok.status).toBe(0);

    const manifest = join(fixtureDir, "apps", "demo-app", "package.json");
    const original = JSON.parse(readFileSync(manifest, "utf8")) as object;
    await withFile(
      "apps/demo-app/package.json",
      JSON.stringify({ ...original, scripts: { "cf:preview": "x" } }),
      async () => {
        const bad = await run(["check", "scripts"], { env: { CI: "true" } });
        expect(bad.status).toBe(1);
        expect(bad.stderr).toContain("apps/demo-app");
        expect(bad.stderr).toContain("use `preview`");
      },
    );
  });

  it("check env loads the registry from the checkout's manifests", async () => {
    // The fixture declares only a couple of variables, far under the floor
    // that keeps the check from passing vacuously, so it fails; what matters
    // is that it counted the manifests it found rather than crashing on them.
    const { status, stderr } = await run(["check", "env"], {
      env: { CI: "true" },
    });
    expect(stderr).not.toContain("failed to import");
    expect(status).toBe(1);
    expect(stderr).toMatch(/Only \d+ variables are declared/);
  });

  it("check migrations flags a new migration older than the base's newest", async () => {
    const git = (...args: string[]): void => {
      execFileSync(
        "git",
        ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args],
        { cwd: fixtureDir, stdio: "ignore" },
      );
    };
    const migrations = join(fixtureDir, "supabase", "migrations");
    mkdirSync(migrations, { recursive: true });
    try {
      git("init", "-b", "main");
      writeFileSync(join(migrations, "20260301000000_platform_base.sql"), "");
      writeFileSync(join(fixtureDir, ".gitignore"), "node_modules/\n");
      git("add", ".gitignore", "supabase");
      git("commit", "-m", "base");
      git("checkout", "-b", "feature");
      writeFileSync(join(migrations, "20260101000000_platform_late.sql"), "");
      git("add", "supabase");
      git("commit", "-m", "late");

      const bad = await run(["check", "migrations", "--base", "main"], {
        env: { CI: "true" },
      });
      expect(bad.status).toBe(1);
      expect(bad.stderr).toContain("20260101000000_platform_late.sql");

      git("checkout", "main");
      const ok = await run(["check", "migrations", "--base", "main"], {
        env: { CI: "true" },
      });
      expect(ok.status).toBe(0);
      expect(ok.stdout).toContain("in order");
    } finally {
      rmSync(join(fixtureDir, ".git"), { recursive: true, force: true });
      rmSync(join(fixtureDir, "supabase"), { recursive: true, force: true });
      rmSync(join(fixtureDir, ".gitignore"), { force: true });
    }
  });

  // ── cron contract (was repo-checks' live cron-contract test) ──────────────

  it("cron list refuses a scheduled.ts that breaks the cron contract", async () => {
    await withFile(
      "apps/demo-app/cloudflare/scheduled.ts",
      'export const CRON_ROUTES = { "*/30 * * * *": { routes: ["/cron/x"], label: "" } };\n',
      async () => {
        const { status, stderr, stdout } = await run(
          ["cron", "list", "--tier", "development"],
          { env: { CI: "true" } },
        );
        expect(status).not.toBe(0);
        expect(`${stdout}${stderr}`.length).toBeGreaterThan(0);
      },
    );
  });

  // ── devtools-ci stdout purity (was repo-checks' deploy-cli-dispatch test) ─

  it("devtools-ci deploy prints nothing to stdout, even for its own usage output", async () => {
    const { stdout, stderr } = await run(["deploy"], {
      bin: join(fixtureDir, "node_modules", ".bin", "devtools-ci"),
      env: { DEPLOY_ENV: "", DEV_DB: "", CI: "true" },
    });
    // A deploy job's stdout can be a credential channel; a banner landing on
    // it would be an unmasked value in a public job log.
    expect(stdout).toBe("");
    expect(stderr.length).toBeGreaterThan(0);
  });

  it("devtools-ci-bare resolves no tier and loads no env file: --help works cold", async () => {
    const { status, stdout } = await run(["--help"], {
      bin: join(fixtureDir, "node_modules", ".bin", "devtools-ci-bare"),
      cwd: tmpdir(),
    });
    expect(status).toBe(0);
    expect(stdout).toContain("deploy");
  });

  // ── the deprecated run alias ───────────────────────────────────────────────

  it("run names its replacement before it runs", async () => {
    const { stderr } = await run(
      ["run", "no-such-task", "--all", "--tier", "development"],
      { env: { CI: "true", DEVTOOLS_TELEMETRY: "0" } },
    );
    expect(stderr).toContain("devtools run is deprecated.");
    expect(stderr).toContain("pnpm -r run no-such-task");
  });

  // ── --dry-run, the failure log and the script picker ───────────────────────

  it("--dry-run prints the tool call a passthrough would make and spawns nothing", async () => {
    const { status, stderr } = await run(
      ["--tier", "development", "--dry-run", "wrangler", "--version"],
      { env: { CI: "true", DEVTOOLS_TELEMETRY: "0" } },
    );
    expect(status).toBe(0);
    expect(stderr).toContain("Would run: pnpm exec wrangler --version");
    expect(stderr).not.toContain("Ran:");
  });

  it("--dry-run stops a command that writes and says what it would run", async () => {
    const { status, stderr } = await run(
      [
        "cron",
        "run",
        "--app",
        "demo-app",
        "--dry-run",
        "--tier",
        "development",
      ],
      { env: { CI: "true", DEVTOOLS_TELEMETRY: "0" } },
    );
    expect(status).toBe(0);
    expect(stderr).toContain("Would run: devtools cron run --app demo-app");
  });

  it("a failed run writes a log and prints its path", async () => {
    const logDir = join(tmpRoot, "logs");
    const { status, stderr } = await run(
      ["no-such-command", "--tier", "development"],
      {
        env: { CI: "true", DEVTOOLS_TELEMETRY: "0", DEVTOOLS_LOG_DIR: logDir },
      },
    );
    expect(status).toBe(1);
    expect(stderr).toContain("Log for #tech-support:");
    const logs = readdirSync(logDir).filter((name) => name.endsWith(".log"));
    expect(logs).toHaveLength(1);
    const text = readFileSync(join(logDir, logs[0]!), "utf8");
    expect(text).toContain("devtools no-such-command");
    expect(text).toContain("exit code: 1");
  });

  it("script runs pnpm -F <package> run <script> and prints the command after", async () => {
    const { status, stdout, stderr } = await run(
      ["script", "demo-app", "build", "--tier", "development"],
      { env: { CI: "true", DEVTOOLS_TELEMETRY: "0" } },
    );
    expect(status).toBe(0);
    expect(stdout).toContain("hello from demo-app");
    expect(stderr).toContain("Ran: pnpm -F demo-app run build");
  });

  it("script refuses a script the package does not have", async () => {
    const { status, stderr } = await run(
      ["script", "demo-app", "no-such-script", "--tier", "development"],
      { env: { CI: "true", DEVTOOLS_TELEMETRY: "0" } },
    );
    expect(status).toBe(1);
    expect(stderr).toContain('has no script "no-such-script"');
  });
});

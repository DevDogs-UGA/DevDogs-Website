/**
 * Unit tests for `stripTierFlag`, the one pure piece of `launch.ts`, plus
 * `launch()`'s bypasses: `--help`/`-h`, the `setup`/`completions` commands
 * that must run before there is a tier to resolve, and the catalog-driven
 * `envFree` bypass (`github rulesets`/`github settings`, TASK-342).
 *
 * Everything else in that module either resolves the real filesystem
 * (`availableTiers`), mutates `process.env` (`enterEnvironment`), or exits
 * the process outright on refusal — none of which belongs in a unit test.
 * `resolveSessionTier` itself already carries the policy coverage, in
 * `@devdogsuga/env`'s own `session.test.ts`; this file is only about argv
 * surgery and the one branch of `launch()` that is safe to exercise without
 * either of those.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stripTierFlag } from "./launch.js";
import type * as RepoRoot from "@devdogsuga/cli-core/repo/root";

const resolveSessionTier = vi.fn<(...args: unknown[]) => unknown>();
const enterEnvironment = vi.fn(async (..._args: unknown[]) => ({
  files: [".env"],
  warnings: [],
  environment: {},
}));
class MissingEnvFileError extends Error {}
class LocalStackOfflineError extends Error {}
// Mocks `../repo/peers.js` rather than the bare `@devdogsuga/env/session`
// and `@devdogsuga/env/load` specifiers: devtools resolves both dynamically
// FROM the target repo now (see `repo/peers.ts`).
vi.mock("@devdogsuga/cli-core/repo/peers", () => ({
  loadEnvSession: async () => ({
    availableTiers: vi.fn(),
    developmentRemoteCandidate: vi.fn(),
    enterEnvironment: (...args: unknown[]) => enterEnvironment(...args),
    resolveSessionTier: (...args: unknown[]) => resolveSessionTier(...args),
  }),
  loadEnvLoad: async () => ({
    probeLocalStack: vi.fn(),
    MissingEnvFileError,
    LocalStackOfflineError,
    SHELL_KEYS_ENV: "DEVTOOLS_SHELL_KEYS",
  }),
}));

const main = vi.fn<(...args: unknown[]) => unknown>();
vi.mock("./cli.js", () => ({ main: (...args: unknown[]) => main(...args) }));

// A menu invocation needs `discoverRepoRoot()` to find a repo before it can
// resolve a tier — real repo discovery walks up from `process.cwd()`, which
// in THIS test run is Backstage's own checkout, not a DevDogsUGA clone (see
// the "oauth" test below). Mocked here, unlike `findRepoRoot()` elsewhere in
// this suite (which `vitest.config.ts` already stabilizes via
// `DEVTOOLS_TEST_REPO_ROOT`), so a bare/resumed-group invocation can reach
// its tier resolution instead of hitting the `RepoNotFoundError` exit.
vi.mock("@devdogsuga/cli-core/repo/root", async (importOriginal) => {
  const actual = await importOriginal<typeof RepoRoot>();
  return {
    ...actual,
    discoverRepoRoot: () => "/fake/repo",
    findRepoRoot: () => "/fake/repo",
  };
});

describe("stripTierFlag", () => {
  it("returns argv untouched when --tier is absent", () => {
    expect(stripTierFlag(["db", "status", "--target", "remote"])).toEqual({
      explicit: undefined,
      rest: ["db", "status", "--target", "remote"],
    });
  });

  it("strips a leading --tier and its value", () => {
    expect(stripTierFlag(["--tier", "staging", "db", "status"])).toEqual({
      explicit: "staging",
      rest: ["db", "status"],
    });
  });

  it("strips --tier from the middle, leaving the rest in order", () => {
    expect(
      stripTierFlag([
        "db",
        "status",
        "--tier",
        "production",
        "--target",
        "remote",
      ]),
    ).toEqual({
      explicit: "production",
      rest: ["db", "status", "--target", "remote"],
    });
  });

  it("strips a trailing --tier with no value, leaving no explicit tier", () => {
    expect(stripTierFlag(["db", "status", "--tier"])).toEqual({
      explicit: undefined,
      rest: ["db", "status"],
    });
  });

  it("does not consume a following flag as the tier value", () => {
    // The guard every other flag-value reader in this CLI keeps. Without it,
    // `--tier --help` would swallow `--help` as a bogus tier and refuse with
    // "unknown tier" instead of reaching launch()'s help bypass.
    expect(stripTierFlag(["--tier", "--help", "db"])).toEqual({
      explicit: undefined,
      rest: ["--help", "db"],
    });
  });

  it("does not consume a single-dash flag as the tier value", () => {
    expect(stripTierFlag(["--tier", "-h", "db"])).toEqual({
      explicit: undefined,
      rest: ["-h", "db"],
    });
  });

  it("leaves a command's own --tier-shaped flag alone when named differently", () => {
    // Sanity check: this function only ever looks for the literal "--tier"
    // token, so a command's own `--target`/`--app` flags are never touched.
    expect(stripTierFlag(["cf", "preview", "--app", "platform"])).toEqual({
      explicit: undefined,
      rest: ["cf", "preview", "--app", "platform"],
    });
  });
});

describe("launch", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("routes --help straight to cli.ts without resolving a tier", async () => {
    const { launch } = await import("./launch.js");
    await launch(["--help"]);
    expect(resolveSessionTier).not.toHaveBeenCalled();
    expect(main).toHaveBeenCalledWith(["--help"]);
  });

  it("routes -h straight to cli.ts without resolving a tier", async () => {
    const { launch } = await import("./launch.js");
    await launch(["db", "-h"]);
    expect(resolveSessionTier).not.toHaveBeenCalled();
    expect(main).toHaveBeenCalledWith(["db", "-h"]);
  });

  it("still strips a --tier flag ahead of a --help bypass", async () => {
    const { launch } = await import("./launch.js");
    await launch(["--tier", "staging", "db", "--help"]);
    expect(resolveSessionTier).not.toHaveBeenCalled();
    expect(main).toHaveBeenCalledWith(["db", "--help"]);
  });

  it("a valueless --tier right before --help still reaches the help bypass", async () => {
    const { launch } = await import("./launch.js");
    await launch(["--tier", "--help"]);
    expect(resolveSessionTier).not.toHaveBeenCalled();
    expect(main).toHaveBeenCalledWith(["--help"]);
  });

  it("a valueless --tier right before -h still reaches the help bypass", async () => {
    const { launch } = await import("./launch.js");
    await launch(["--tier", "-h"]);
    expect(resolveSessionTier).not.toHaveBeenCalled();
    expect(main).toHaveBeenCalledWith(["-h"]);
  });

  it("setup skips tier resolution and enters development — the bootstrap-deadlock guard", async () => {
    // `setup` exists to CREATE a missing env file; resolving a tier first
    // (say a stale DEPLOY_ENV=staging with no .env.staging) would refuse
    // before the one command that fixes that state could run.
    const { launch } = await import("./launch.js");
    await launch(["setup"]);
    expect(resolveSessionTier).not.toHaveBeenCalled();
    expect(enterEnvironment).toHaveBeenCalledWith("development", {
      override: false,
    });
    expect(main).toHaveBeenCalledWith(["setup"]);
  });

  it("completions skips tier resolution — shell rc files are non-TTY and read no env", async () => {
    const { launch } = await import("./launch.js");
    await launch(["completions", "bash"]);
    expect(resolveSessionTier).not.toHaveBeenCalled();
    expect(main).toHaveBeenCalledWith(["completions", "bash"]);
  });

  it("github rulesets skips tier resolution — catalog-marked envFree (TASK-322/TASK-342 wart)", async () => {
    const { launch } = await import("./launch.js");
    await launch(["github", "rulesets", "--apply"]);
    expect(resolveSessionTier).not.toHaveBeenCalled();
    expect(enterEnvironment).toHaveBeenCalledWith("development", {
      override: false,
    });
    expect(main).toHaveBeenCalledWith(["github", "rulesets", "--apply"]);
  });

  it("github settings skips tier resolution — catalog-marked envFree", async () => {
    const { launch } = await import("./launch.js");
    await launch(["github", "settings", "--json"]);
    expect(resolveSessionTier).not.toHaveBeenCalled();
    expect(main).toHaveBeenCalledWith(["github", "settings", "--json"]);
  });

  describe("DEVTOOLS_SHELL_KEYS marker", () => {
    const MARKER = "DEVTOOLS_SHELL_KEYS";
    let hadMarker: boolean;
    let previousMarker: string | undefined;

    beforeEach(() => {
      hadMarker = MARKER in process.env;
      previousMarker = process.env[MARKER];
      delete process.env[MARKER];
    });

    afterEach(() => {
      if (hadMarker) process.env[MARKER] = previousMarker!;
      else delete process.env[MARKER];
    });

    it("records the shell's own keys before entering, when no marker is inherited", async () => {
      process.env.DEVTOOLS_TEST_SHELL_PROBE = "1";
      try {
        const { launch } = await import("./launch.js");
        await launch(["setup"]);
        expect(process.env[MARKER]).toBeDefined();
        expect(process.env[MARKER]!.split(",")).toContain(
          "DEVTOOLS_TEST_SHELL_PROBE",
        );
      } finally {
        delete process.env.DEVTOOLS_TEST_SHELL_PROBE;
      }
    });

    it("keeps an inherited marker unchanged — a nested launcher must not recompute it", async () => {
      process.env[MARKER] = "ORIGINAL_ONLY";
      process.env.DEVTOOLS_TEST_SHELL_PROBE = "1";
      try {
        const { launch } = await import("./launch.js");
        await launch(["setup"]);
        // Recomputing here would have picked up DEVTOOLS_TEST_SHELL_PROBE (and
        // everything else this process now holds) as if it were a genuine
        // shell export — exactly the staleness bug the guard exists to avoid.
        expect(process.env[MARKER]).toBe("ORIGINAL_ONLY");
      } finally {
        delete process.env.DEVTOOLS_TEST_SHELL_PROBE;
      }
    });
  });

  it("oauth skips tier resolution — catalog-marked envFree (TASK-345)", async () => {
    // `envFree` short-circuits BEFORE the `discoverRepoRoot()` check below —
    // `oauth` never calls it at all, so this passes regardless of what a real
    // checkout would answer (`./repo/root.js` is mocked above for the
    // menu-invocation tests, which genuinely do need it to find a repo).
    // Reaching `main()` anyway is what proves `oauth` runs outside a checkout.
    const { launch } = await import("./launch.js");
    await launch(["oauth", "--base-url", "https://api.devdogsuga.org"]);
    expect(resolveSessionTier).not.toHaveBeenCalled();
    expect(enterEnvironment).toHaveBeenCalledWith("development", {
      override: false,
    });
    expect(main).toHaveBeenCalledWith([
      "oauth",
      "--base-url",
      "https://api.devdogsuga.org",
    ]);
  });

  describe("entering the environment: at launch, or deferred to the menu", () => {
    const savedIsTTY = process.stdin.isTTY;
    const savedDeployEnv = process.env.DEPLOY_ENV;
    const savedDevDb = process.env.DEV_DB;

    beforeEach(() => {
      resolveSessionTier.mockResolvedValue({
        ok: true,
        tier: "development",
        resolvedBy: "sole",
      });
      delete process.env.DEPLOY_ENV;
      delete process.env.DEV_DB;
    });

    afterEach(() => {
      Object.defineProperty(process.stdin, "isTTY", {
        value: savedIsTTY,
        configurable: true,
      });
      if (savedDeployEnv === undefined) delete process.env.DEPLOY_ENV;
      else process.env.DEPLOY_ENV = savedDeployEnv;
      if (savedDevDb === undefined) delete process.env.DEV_DB;
      else process.env.DEV_DB = savedDevDb;
    });

    it("a bare invocation exports the tier but does not enter it before dispatching to the menu", async () => {
      const { launch } = await import("./launch.js");
      const { takeMenuEnvHook } =
        await import("@devdogsuga/cli-core/env-entry");

      await launch([]);

      // `main` (the menu's own entry point, mocked here) ran; the actual env
      // files were never loaded to get there.
      expect(main).toHaveBeenCalledWith([]);
      expect(enterEnvironment).not.toHaveBeenCalled();
      // The tier decision itself IS exported up front, same as `--tier` would be.
      expect(process.env.DEPLOY_ENV).toBe("development");

      // `runMenu` would call this, right before dispatching whatever the
      // reader chose — simulated here since `main` is mocked and never
      // really walks the tree in this file.
      const hook = takeMenuEnvHook();
      expect(hook).toBeTypeOf("function");
      const dispatched = await hook!(["db", "status"], async () => "Done.");
      expect(dispatched).toBe("Done.");
      expect(enterEnvironment).toHaveBeenCalledWith("development", {
        override: false,
        devDatabase: undefined,
      });
    });

    it("a bare group resumed at a TTY (devtools db) also defers entry", async () => {
      Object.defineProperty(process.stdin, "isTTY", {
        value: true,
        configurable: true,
      });
      const { launch } = await import("./launch.js");
      const { takeMenuEnvHook } =
        await import("@devdogsuga/cli-core/env-entry");

      await launch(["db"]);

      expect(main).toHaveBeenCalledWith(["db"]);
      expect(enterEnvironment).not.toHaveBeenCalled();
      expect(takeMenuEnvHook()).toBeTypeOf("function");
    });

    it("a bare group on a non-TTY does NOT defer — bareGroupStartPath never resumes off a terminal", async () => {
      // `process.stdin.isTTY` defaults to falsy in this test run; explicit
      // here so the test does not depend on that ambient default.
      Object.defineProperty(process.stdin, "isTTY", {
        value: false,
        configurable: true,
      });
      const { launch } = await import("./launch.js");
      const { takeMenuEnvHook } =
        await import("@devdogsuga/cli-core/env-entry");

      await launch(["db"]);

      // Entered eagerly, exactly as a typed command does — `main(["db"])`
      // hits the dispatcher's own "which of …?" refusal, not the wizard.
      expect(enterEnvironment).toHaveBeenCalledWith("development", {
        override: false,
        devDatabase: undefined,
      });
      expect(takeMenuEnvHook()).toBeUndefined();
    });

    it("a typed command still enters the environment before main() runs, unchanged", async () => {
      const { launch } = await import("./launch.js");
      const { takeMenuEnvHook } =
        await import("@devdogsuga/cli-core/env-entry");

      await launch(["db", "status"]);

      expect(enterEnvironment).toHaveBeenCalledWith("development", {
        override: false,
        devDatabase: undefined,
      });
      expect(main).toHaveBeenCalledWith(["db", "status"]);
      // Entered, dispatched, and done — nothing left for a menu to run later.
      expect(takeMenuEnvHook()).toBeUndefined();

      const enterOrder = enterEnvironment.mock.invocationCallOrder[0]!;
      const mainOrder = main.mock.invocationCallOrder[0]!;
      expect(enterOrder).toBeLessThan(mainOrder);
    });
  });
});

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
import { afterEach, describe, expect, it, vi } from "vitest";
import { stripPreflightFlags, stripTierFlag } from "./launch.js";

// `launch()` now runs preflight unconditionally on every invocation (see
// `repo/preflight.ts`) — mocked here so this file's `launch(...)` calls
// stay hermetic (no real network fetch) and independent of preflight's own
// behavior, which has its own dedicated coverage in `repo/preflight.test.ts`.
const runPreflight = vi.fn(async () => ({ action: "up-to-date" as const, source: "cache" as const }));
vi.mock("./repo/preflight.js", () => ({
  runPreflight: (...args: unknown[]) => runPreflight(...args),
  ownVersion: () => "0.0.0-dev",
  isDevMode: () => true,
}));

const resolveSessionTier = vi.fn();
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
vi.mock("./repo/peers.js", () => ({
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
  }),
}));

const main = vi.fn();
vi.mock("./cli.js", () => ({ main: (...args: unknown[]) => main(...args) }));

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

describe("stripPreflightFlags", () => {
  const savedSkipEnv = process.env.DEVTOOLS_SKIP_PREFLIGHT;
  afterEach(() => {
    if (savedSkipEnv === undefined) delete process.env.DEVTOOLS_SKIP_PREFLIGHT;
    else process.env.DEVTOOLS_SKIP_PREFLIGHT = savedSkipEnv;
  });

  it("leaves ordinary argv untouched", () => {
    delete process.env.DEVTOOLS_SKIP_PREFLIGHT;
    expect(stripPreflightFlags(["db", "status"])).toEqual({
      skipPreflight: false,
      refresh: false,
      rest: ["db", "status"],
    });
  });

  it("strips --skip-preflight from anywhere and sets the flag", () => {
    delete process.env.DEVTOOLS_SKIP_PREFLIGHT;
    expect(stripPreflightFlags(["db", "--skip-preflight", "status"])).toEqual({
      skipPreflight: true,
      refresh: false,
      rest: ["db", "status"],
    });
  });

  it("strips --refresh and sets the flag", () => {
    delete process.env.DEVTOOLS_SKIP_PREFLIGHT;
    expect(stripPreflightFlags(["--refresh", "cron", "list"])).toEqual({
      skipPreflight: false,
      refresh: true,
      rest: ["cron", "list"],
    });
  });

  it("DEVTOOLS_SKIP_PREFLIGHT=1 sets skipPreflight without a flag", () => {
    process.env.DEVTOOLS_SKIP_PREFLIGHT = "1";
    expect(stripPreflightFlags(["db", "status"])).toEqual({
      skipPreflight: true,
      refresh: false,
      rest: ["db", "status"],
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

  it("oauth skips tier resolution — catalog-marked envFree (TASK-345)", async () => {
    // This module's cwd (Backstage's own checkout) is not a DevDogsUGA
    // clone, so `discoverRepoRoot()` genuinely returns null here — the same
    // condition a workshop repo with no DevDogsUGA checkout at all would
    // hit. Reaching `main()` anyway, rather than the `RepoNotFoundError`
    // exit, is what proves `oauth` runs outside a checkout.
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

});

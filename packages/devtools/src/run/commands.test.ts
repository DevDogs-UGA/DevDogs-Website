/**
 * The guard that decides whether `run` is allowed to open a prompt, and the
 * `--tier production` guard `runTask` applies before it ever gets there.
 *
 * Worth its own file because every way of getting it wrong is silent. A picker
 * that asks when nobody is listening hangs instead of failing, holding a CI job
 * open until the workflow's timeout kills it with no output saying why. The
 * production guard fails the same way: a script that slipped past the confirm
 * would spawn pnpm against live credentials with nobody watching.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `runTask` never returns for `--tier production` either — every path ends in
 * `passthrough`, which calls `process.exit` (see `commands.ts`'s own header) — so
 * these three modules are faked at the boundary rather than driven for real:
 * `process-group` so `passthrough` never actually spawns pnpm,
 * `@clack/prompts` so the confirm is scripted rather than typed, and
 * `../repo/peers.js`'s `loadEnvLoad()` because `runTask` reaches it only
 * through a dynamic call gated on `--tier` (see the header on why it must
 * stay dynamic) — `vi.mock` intercepts that the same as a static import.
 */
vi.mock("@devdogsuga/cli-core/process-group", () => ({
  runInGroup: vi.fn(async () => ({ code: 0, signal: null })),
  reportRan: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
  confirm: vi.fn(),
  isCancel: () => false,
  cancel: vi.fn(),
  multiselect: vi.fn(),
}));

const loadEnvironment = vi.fn(async () => ({
  environment: "production",
  files: [],
  env: { FOO: "bar" },
  warnings: [],
}));
class MissingEnvFileError extends Error {}

vi.mock("@devdogsuga/cli-core/repo/peers", () => ({
  loadEnvLoad: async () => ({ loadEnvironment, MissingEnvFileError }),
}));

const captureDeprecation = vi.fn(async () => undefined);
vi.mock("@devdogsuga/cli-core/telemetry", () => ({
  captureDevtoolsDeprecation: (...args: unknown[]) =>
    (captureDeprecation as (...a: unknown[]) => Promise<void>)(...args),
  devtoolsEnvironment: () => "local",
}));

const {
  extractFilters,
  parseTierArg,
  groupFiltersByRoot,
  planDev,
  RUN_ALIAS_FINGERPRINT,
  runAliasMessage,
  runTask,
  shouldAsk,
} = await import("./commands.js");
const { runInGroup } = await import("@devdogsuga/cli-core/process-group");
const { cancel, confirm } = await import("@clack/prompts");

/**
 * `process.stdin.isTTY` is a plain data property, not an accessor. Node defines
 * it only when stdin IS a terminal, so `vi.spyOn(…, "get")` has nothing to
 * replace and throws. Assigning and restoring by hand is the portable way, and
 * every test must set it: on a developer's terminal it is already `true` while
 * under CI it is absent, so a test that left it alone would pass or fail
 * depending on where it ran.
 */
const REAL_TTY = process.stdin.isTTY;

function tty(value: boolean): void {
  process.stdin.isTTY = value;
}

afterEach(() => {
  process.stdin.isTTY = REAL_TTY;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("shouldAsk", () => {
  it("asks on an interactive terminal with no filter", () => {
    tty(true);
    vi.stubEnv("CI", "");
    vi.stubEnv("DEVDOGS_PICK", "");
    expect(shouldAsk([])).toBe(true);
  });

  it("never asks under CI", () => {
    tty(true);
    vi.stubEnv("CI", "true");
    expect(shouldAsk([])).toBe(false);
  });

  it("never asks without a TTY", () => {
    tty(false);
    vi.stubEnv("CI", "");
    expect(shouldAsk([])).toBe(false);
  });

  it("never asks when the recursion guard is set", () => {
    tty(true);
    vi.stubEnv("CI", "");
    vi.stubEnv("DEVDOGS_PICK", "0");
    expect(shouldAsk([])).toBe(false);
  });

  // pnpm's own flags spell the same idea two ways (`--filter` and `-F`),
  // plus `--scope` for anyone still typing the old name; each accepts
  // both a separate value and an `=` form. Missing one would mean asking a
  // caller to repeat a choice they had already made on the command line.
  it.each([
    ["--filter", "platform"],
    ["-F", "platform"],
    ["--scope", "platform"],
  ])("defers to an explicit %s", (flag, value) => {
    tty(true);
    vi.stubEnv("CI", "");
    vi.stubEnv("DEVDOGS_PICK", "");
    expect(shouldAsk([flag, value])).toBe(false);
    expect(shouldAsk([`${flag}=${value}`])).toBe(false);
  });

  it("is not fooled by a flag that merely starts the same way", () => {
    tty(true);
    vi.stubEnv("CI", "");
    vi.stubEnv("DEVDOGS_PICK", "");
    // `--force` is not `-F`, and pnpm has flags that begin with these
    // letters. Prefix matching is only ever applied to the `=` form.
    expect(shouldAsk(["--force"])).toBe(true);
  });
});

/**
 * `parseTierArg` is pure — no `process.exit` — specifically so it can be
 * tested here without going through `passthrough`, which every other path in
 * `runTask` ends at.
 */
describe("parseTierArg", () => {
  it("strips a valid tier and its value from rest", () => {
    expect(parseTierArg(["--tier", "staging", "--filter", "platform"])).toEqual(
      { tier: "staging", rest: ["--filter", "platform"] },
    );
  });

  it("accepts development and production too", () => {
    expect(parseTierArg(["--tier", "development"])).toEqual({
      tier: "development",
      rest: [],
    });
    expect(parseTierArg(["--tier", "production"])).toEqual({
      tier: "production",
      rest: [],
    });
  });

  it("errors when --tier has no value", () => {
    const result = parseTierArg(["--tier"]);
    expect(result.tier).toBeUndefined();
    expect(result.error).toContain("--tier requires a value");
  });

  it("errors when --tier's value looks like another flag", () => {
    const result = parseTierArg(["--tier", "--filter"]);
    expect(result.tier).toBeUndefined();
    expect(result.error).toContain("--tier requires a value");
  });

  it("errors on a value outside the canonical tier set, preflight included", () => {
    for (const bad of ["preflight", "prod", "bogus"]) {
      const result = parseTierArg(["--tier", bad]);
      expect(result.tier, bad).toBeUndefined();
      expect(result.error, bad).toContain(`unknown tier "${bad}"`);
    }
  });

  it("passes args through unchanged when --tier is absent", () => {
    expect(parseTierArg(["--filter", "platform", "--all"])).toEqual({
      rest: ["--filter", "platform", "--all"],
    });
  });
});

/**
 * `extractFilters` is what turns a caller's raw `--filter`/`-F`/`--scope`
 * arguments into the package patterns `passthroughApps` builds `pnpm`
 * commands from. It has to handle the separate-value form (`--filter x`) and
 * the `=` form (`--filter=x`) for all three flag spellings, and leave
 * everything else in `rest` untouched and in order.
 */
describe("extractFilters", () => {
  it("extracts a separate-value --filter", () => {
    expect(extractFilters(["--filter", "platform", "--watch"])).toEqual({
      filters: ["platform"],
      rest: ["--watch"],
    });
  });

  it("extracts an --filter=value form", () => {
    expect(extractFilters(["--filter=platform", "--watch"])).toEqual({
      filters: ["platform"],
      rest: ["--watch"],
    });
  });

  it("extracts -F and translates --scope the same way", () => {
    expect(
      extractFilters(["-F", "platform", "--scope=schedule-builder"]),
    ).toEqual({
      filters: ["platform", "schedule-builder"],
      rest: [],
    });
  });

  it("collects every filter when more than one is given", () => {
    expect(
      extractFilters(["--filter", "platform", "--filter", "sandbox"]),
    ).toEqual({
      filters: ["platform", "sandbox"],
      rest: [],
    });
  });

  it("leaves non-filter args alone, in order", () => {
    expect(extractFilters(["--watch", "--foo", "bar"])).toEqual({
      filters: [],
      rest: ["--watch", "--foo", "bar"],
    });
  });

  it("treats a --filter with no value as a plain arg rather than dropping it", () => {
    expect(extractFilters(["--filter"])).toEqual({
      filters: [],
      rest: ["--filter"],
    });
  });
});

/**
 * `runTask`'s own gate on `--tier production`: refused outright without a
 * terminal, confirmed on one, and only loads `.env.production`'s credentials
 * into the child process once that confirm is approved. `--all` is passed
 * throughout so every case reaches `passthrough` directly instead of also
 * exercising the app multiselect, which is covered nowhere near this guard.
 *
 * `process.exit` is spied to throw rather than actually end the worker, which
 * is also how `passthrough`'s own exit — the one every one of these cases
 * eventually reaches — is observed.
 */
describe("runTask --tier production guard", () => {
  beforeEach(() => {
    // `restoreAllMocks()` below only rewinds spies made with `vi.spyOn`; the
    // plain `vi.fn()`s a module mock factory returns keep their call history
    // across tests, so each of these is reset by hand rather than trusted to
    // start clean.
    vi.mocked(runInGroup)
      .mockClear()
      .mockResolvedValue({ code: 0, signal: null });
    vi.mocked(confirm).mockReset();
    vi.mocked(cancel).mockClear();
    vi.mocked(loadEnvironment).mockResolvedValue({
      environment: "production",
      files: [],
      env: { FOO: "bar" },
      warnings: [],
    });
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit:${code ?? 0}`);
    });
  });

  it("refuses outright without a terminal, before any confirm or spawn", async () => {
    tty(false);
    await expect(
      runTask(["dev", "--all", "--tier", "production"]),
    ).rejects.toThrow("exit:1");
    expect(confirm).not.toHaveBeenCalled();
    expect(runInGroup).not.toHaveBeenCalled();
  });

  it("runs nothing when the confirm is declined", async () => {
    tty(true);
    vi.mocked(confirm).mockResolvedValue(false);
    await expect(
      runTask(["dev", "--all", "--tier", "production"]),
    ).rejects.toThrow("exit:0");
    expect(cancel).toHaveBeenCalled();
    expect(runInGroup).not.toHaveBeenCalled();
  });

  it("loads production's env and threads it to every spawned child once approved", async () => {
    tty(true);
    vi.mocked(confirm).mockResolvedValue(true);
    await expect(
      runTask(["dev", "--all", "--tier", "production"]),
    ).rejects.toThrow("exit:0");

    // `dev` is in `NEEDS_DEPS_BUILT`, so an `--all` (workspace-wide) run
    // spawns twice: build every app's dependencies first (see
    // `passthroughApps`'s doc comment on why that is `<app>^...` per real
    // app, read from `apps/*`, rather than a bare `pnpm -r run build` —
    // the latter would also run each app's OWN build script), then the
    // `--parallel` dev task. Both children need the tier env, not just the
    // one that would exist under a single-spawn passthrough.
    expect(runInGroup).toHaveBeenCalledTimes(2);
    const [, rawBuildArgs, buildOptions] = vi.mocked(runInGroup).mock.calls[0]!;
    const buildArgs = rawBuildArgs as string[];
    expect(buildArgs.slice(0, 2)).toEqual(["-r", "--if-present"]);
    expect(buildArgs.slice(-2)).toEqual(["run", "build"]);
    // The filters in between are `--filter '<app>^...'` for every real
    // `apps/*` package, order-independent (`readdirSync` order is not
    // guaranteed).
    const middle = buildArgs.slice(2, -2);
    const filterValues = middle.filter((_: string, i: number) => i % 2 === 1);
    expect(new Set(filterValues)).toEqual(
      new Set([
        "platform^...",
        "sandbox^...",
        "schedule-builder^...",
        "study-group-finder^...",
      ]),
    );
    const [, devArgs, devOptions] = vi.mocked(runInGroup).mock.calls[1]!;
    expect(devArgs).toEqual(["-r", "--if-present", "--parallel", "run", "dev"]);
    for (const options of [buildOptions, devOptions]) {
      const env = (options as unknown as { env: NodeJS.ProcessEnv }).env;
      expect(env.DEPLOY_ENV).toBe("production");
      expect(env.FOO).toBe("bar");
    }
  });

  it("does not gate a non-production tier behind a terminal", async () => {
    tty(false);
    await expect(
      runTask(["dev", "--all", "--tier", "staging"]),
    ).rejects.toThrow("exit:0");

    expect(confirm).not.toHaveBeenCalled();
    expect(runInGroup).toHaveBeenCalledTimes(2);
    const options = vi.mocked(runInGroup).mock.calls[1]![2] as unknown as {
      env: NodeJS.ProcessEnv;
    };
    expect(options.env.DEPLOY_ENV).toBe("staging");
  });
});

/**
 * `passthrough`'s exit code, reached through `runTask` since `passthrough`
 * itself is not exported. The process-group runner reports a death by signal
 * as `128 + n`, like a shell, so a signal is just another number here.
 */
describe("passthrough exit code", () => {
  beforeEach(() => {
    vi.mocked(runInGroup).mockClear();
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit:${code ?? 0}`);
    });
  });

  // `build --all` is the one task/filter combination with just a single
  // spawn (see `passthroughApps`'s doc comment on why a workspace-wide build
  // skips the separate dependency pre-step), so `mockReturnValue` applying
  // to "every call" and "the one call that happens" coincide here.
  it("exits with the child's own status", async () => {
    vi.mocked(runInGroup).mockResolvedValue({
      code: 3,
      signal: null,
    });
    tty(true);
    vi.stubEnv("CI", "");
    vi.stubEnv("DEVDOGS_PICK", "");
    await expect(runTask(["build", "--all"])).rejects.toThrow("exit:3");
    expect(runInGroup).toHaveBeenCalledOnce();
    expect(vi.mocked(runInGroup).mock.calls[0]![1]).toEqual([
      "-r",
      "--if-present",
      "run",
      "build",
    ]);
  });

  it("exits the way a shell reports a death by signal", async () => {
    vi.mocked(runInGroup).mockResolvedValue({
      code: 130,
      signal: "SIGINT",
    } as unknown as Awaited<ReturnType<typeof runInGroup>>);
    tty(true);
    vi.stubEnv("CI", "");
    vi.stubEnv("DEVDOGS_PICK", "");
    await expect(runTask(["build", "--all"])).rejects.toThrow("exit:130");
  });

  it("stops at the dependency build and never runs the task when it fails", async () => {
    // `typecheck` always gets a dependency pre-step, filtered or not, unlike
    // `build`. The first (deps) spawn fails; the second (the actual
    // typecheck) must never happen.
    vi.mocked(runInGroup).mockResolvedValueOnce({
      code: 2,
      signal: null,
    });
    tty(true);
    vi.stubEnv("CI", "");
    vi.stubEnv("DEVDOGS_PICK", "");
    await expect(runTask(["typecheck", "--all"])).rejects.toThrow("exit:2");
    expect(runInGroup).toHaveBeenCalledOnce();
    const args = vi.mocked(runInGroup).mock.calls[0]![1] as string[];
    expect(args.slice(0, 2)).toEqual(["-r", "--if-present"]);
    expect(args.slice(-2)).toEqual(["run", "build"]);
  });
});

/**
 * The actual `pnpm` command shapes `passthroughApps` builds — the part of
 * this file that stands in for a task graph. Covers: an explicit
 * `--filter` builds that package's dependencies first with `^...` and then
 * runs the task against just that package; a task outside
 * `NEEDS_DEPS_BUILT` skips the dependency spawn entirely; and `dev` always
 * gets `--parallel`.
 */
describe("passthroughApps command shapes", () => {
  beforeEach(() => {
    vi.mocked(runInGroup)
      .mockClear()
      .mockResolvedValue({ code: 0, signal: null });
    tty(true);
    vi.stubEnv("CI", "");
    vi.stubEnv("DEVDOGS_PICK", "");
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit:${code ?? 0}`);
    });
  });

  it("builds a filtered package's dependencies with ^... before running its task", async () => {
    await expect(
      runTask(["typecheck", "--filter", "platform"]),
    ).rejects.toThrow("exit:0");

    expect(runInGroup).toHaveBeenCalledTimes(2);
    expect(vi.mocked(runInGroup).mock.calls[0]![1]).toEqual([
      "-r",
      "--if-present",
      "--filter",
      "platform^...",
      "run",
      "build",
    ]);
    expect(vi.mocked(runInGroup).mock.calls[1]![1]).toEqual([
      "-r",
      "--if-present",
      "--filter",
      "platform",
      "run",
      "typecheck",
    ]);
  });

  it("translates --scope into a real --filter for the pnpm invocation", async () => {
    await expect(
      runTask(["build", "--scope", "schedule-builder"]),
    ).rejects.toThrow("exit:0");

    // `build` filtered still needs the dependency pre-step (see the earlier
    // "build --all" test for why the workspace-wide case differs).
    expect(runInGroup).toHaveBeenCalledTimes(2);
    expect(vi.mocked(runInGroup).mock.calls[0]![1]).toEqual([
      "-r",
      "--if-present",
      "--filter",
      "schedule-builder^...",
      "run",
      "build",
    ]);
    expect(vi.mocked(runInGroup).mock.calls[1]![1]).toEqual([
      "-r",
      "--if-present",
      "--filter",
      "schedule-builder",
      "run",
      "build",
    ]);
  });

  it("skips the dependency spawn entirely for a task outside NEEDS_DEPS_BUILT", async () => {
    await expect(
      runTask(["generate-types", "--filter", "platform"]),
    ).rejects.toThrow("exit:0");

    expect(runInGroup).toHaveBeenCalledOnce();
    expect(vi.mocked(runInGroup).mock.calls[0]![1]).toEqual([
      "-r",
      "--if-present",
      "--filter",
      "platform",
      "run",
      "generate-types",
    ]);
  });

  it("passes --parallel for dev across multiple filtered apps", async () => {
    await expect(
      runTask(["dev", "--filter", "platform", "--filter", "schedule-builder"]),
    ).rejects.toThrow("exit:0");

    expect(runInGroup).toHaveBeenCalledTimes(2);
    expect(vi.mocked(runInGroup).mock.calls[1]![1]).toEqual([
      "-r",
      "--if-present",
      "--parallel",
      "--filter",
      "platform",
      "--filter",
      "schedule-builder",
      "run",
      "dev",
    ]);
  });

  it("forwards trailing non-filter args to the underlying task", async () => {
    await expect(
      runTask(["lint", "--filter", "platform", "--max-warnings", "0"]),
    ).rejects.toThrow("exit:0");

    expect(vi.mocked(runInGroup).mock.calls[1]![1]).toEqual([
      "-r",
      "--if-present",
      "--filter",
      "platform",
      "run",
      "lint",
      "--max-warnings",
      "0",
    ]);
  });
});

/**
 * Which apps `dev` starts as `vinext dev` directly (their Worker needs the
 * session's env through `CLOUDFLARE_INCLUDE_PROCESS_ENV`, see `planDev`) and
 * which keep running their own `dev` script. Pure, so no spawn is involved.
 */
describe("planDev", () => {
  const apps = [
    { name: "platform", script: "with-env vinext dev" },
    { name: "schedule-builder", script: "with-env next dev" },
    { name: "sandbox", script: "wrangler dev" },
  ];

  it("starts a vinext app directly and the rest through their scripts", () => {
    expect(planDev(apps, [], ["--port", "3300"])).toEqual({
      vinext: ["platform"],
      others: [
        "-r",
        "--if-present",
        "--parallel",
        "--filter",
        "schedule-builder",
        "--filter",
        "sandbox",
        "run",
        "dev",
        "--port",
        "3300",
      ],
    });
  });

  it("runs nothing else when only the vinext app is selected", () => {
    expect(planDev(apps, ["platform"], [])).toEqual({
      vinext: ["platform"],
      others: null,
    });
  });

  it("leaves a selection without a vinext app to the scripts alone", () => {
    expect(planDev(apps, ["schedule-builder"], []).vinext).toEqual([]);
  });

  it("does not mistake a script that merely mentions vinext", () => {
    expect(
      planDev([{ name: "x", script: "vinext build && next dev" }], [], [])
        .vinext,
    ).toEqual([]);
  });
});

/**
 * `run` is a deprecated alias (removed by TASK-404 once Sentry stops seeing
 * it): each use names what to type instead and reports one warning under a
 * fixed fingerprint, then runs the task as before.
 */
describe("runTask as a deprecated alias", () => {
  beforeEach(() => {
    vi.mocked(runInGroup)
      .mockClear()
      .mockResolvedValue({ code: 0, signal: null });
    captureDeprecation.mockClear();
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit:${code ?? 0}`);
    });
  });

  it("names the replacement for the task", () => {
    expect(runAliasMessage("typecheck")).toBe(
      "devtools run is deprecated. Use `pnpm -r run typecheck` for every " +
        "package, or `pnpm -F <app> typecheck` for one app.",
    );
  });

  it("prints the replacement, reports it under the fixed fingerprint, and still runs", async () => {
    tty(false);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await expect(runTask(["lint", "--all"])).rejects.toThrow("exit:0");

    expect(stderr).toHaveBeenCalledWith(`${runAliasMessage("lint")}\n`);
    expect(captureDeprecation).toHaveBeenCalledWith(
      "devtools run is deprecated",
      RUN_ALIAS_FINGERPRINT,
      { script: "lint", mode: "local" },
    );
    expect(runInGroup).toHaveBeenCalled();
  });

  it("reports the same fingerprint whatever the script", async () => {
    tty(false);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await expect(runTask(["test", "--all"])).rejects.toThrow("exit:0");

    expect(captureDeprecation.mock.calls[0]?.[1]).toBe(RUN_ALIAS_FINGERPRINT);
  });
});

describe("groupFiltersByRoot", () => {
  const apps = [
    { name: "platform", script: "x", root: "/backstage" },
    { name: "schedule-builder", script: "x", root: "/backstage/devdogsuga" },
  ];

  it("runs the whole workspace of the repo you are in when nothing is filtered", () => {
    expect([...groupFiltersByRoot([], apps, "/backstage")]).toEqual([
      ["/backstage", []],
    ]);
  });

  it("sends a filter to the workspace that holds its app", () => {
    expect([
      ...groupFiltersByRoot(["schedule-builder"], apps, "/backstage"),
    ]).toEqual([["/backstage/devdogsuga", ["schedule-builder"]]]);
  });

  it("splits a selection across both workspaces, unknown filters staying home", () => {
    expect([
      ...groupFiltersByRoot(
        ["schedule-builder", "platform", "./packages/*"],
        apps,
        "/backstage",
      ),
    ]).toEqual([
      ["/backstage", ["platform", "./packages/*"]],
      ["/backstage/devdogsuga", ["schedule-builder"]],
    ]);
  });
});

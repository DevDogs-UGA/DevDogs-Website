/**
 * The wizard's walk, driven through scripted answers.
 *
 * The claim under test is the one the menu exists for: **every interactive
 * command in the tree is reachable from it, and the argv a walk produces is one the CLI
 * accepts.** The menu this replaced could not make that claim. It held ten
 * hand-written entries beside a CLI with sixteen top-level commands, so `env`
 * and `docs index` had no way in.
 *
 * `@clack/prompts` is mocked rather than driven: the point is which questions
 * get asked and what argv comes out, not how a terminal renders them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Environment } from "@devdogsuga/cli-core/environment";

const answers: unknown[] = [];
const asked: string[] = [];

/** Every entry each screen actually drew, for the adaptation tests below. */
interface Entry {
  label?: string;
  hint?: string;
}
const shown: Entry[][] = [];

/**
 * Selects whichever option the current screen drew last, rather than a
 * literal scripted value.
 *
 * `pickSubcommand` appends `BACK_OPTION` after every entry it offers, so
 * "last" is always Back there. `BACK` itself is a symbol
 * private to `menu.ts` — there is no literal a test can import and push onto
 * `answers` — so this is how the "reader backs out" tests select it anyway.
 */
const PICK_BACK = Symbol("pick-back");

vi.mock("@clack/prompts", () => {
  /** Each prompt takes the next scripted answer and records what it drew. */
  const next = (options: {
    message?: string;
    options?: Array<{ value?: unknown; label?: string; hint?: string }>;
  }): Promise<unknown> => {
    asked.push(options.message ?? "");
    // Recorded BEFORE the throw below, so a walk that runs out of answers
    // still leaves the screen it stopped on available to inspect. That is how
    // the filtering tests read one screen without scripting a whole walk.
    if (options.options) {
      shown.push(options.options.map(({ label, hint }) => ({ label, hint })));
    }
    if (answers.length === 0) throw new Error(`unanswered: ${options.message}`);
    const answer = answers.shift();
    if (answer === PICK_BACK) {
      return Promise.resolve(options.options?.at(-1)?.value);
    }
    return Promise.resolve(answer);
  };
  return {
    select: next,
    confirm: next,
    text: next,
    isCancel: () => false,
    cancel: vi.fn(),
    log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), message: vi.fn() },
    note: vi.fn(),
  };
});

const { runMenu, bareGroupStartFlags, bareGroupStartPath } =
  await import("@devdogsuga/cli-core/menu");
const { catalog } = await import("./catalog.js");
const { topLevel: TOP_LEVEL, allPaths, findCommand } = catalog;
const { UNKNOWN_ENVIRONMENT } =
  await import("@devdogsuga/cli-core/environment");
const { setMenuEnvHook, takeMenuEnvHook } =
  await import("@devdogsuga/cli-core/env-entry");

/**
 * Runs one walk with the given answers, returning the argv it dispatched.
 *
 * The environment is injected, and defaults to the one that adapts nothing, so
 * every test below describes the machine it means rather than inheriting
 * whichever machine happens to be running the suite. Letting `runMenu` probe
 * for real would make the reachability claim depend on whether the developer
 * had Docker open.
 */
async function walk(
  scripted: unknown[],
  env: Environment = UNKNOWN_ENVIRONMENT,
): Promise<string[] | null> {
  answers.length = 0;
  asked.length = 0;
  shown.length = 0;
  answers.push(...scripted);

  let dispatched: string[] | null = null;
  await runMenu(
    catalog,
    (argv) => {
      dispatched = argv;
      return Promise.resolve("Done.");
    },
    env,
  );
  return dispatched;
}

/**
 * Runs one walk resumed at `startPath`, mirroring `walk` above but through
 * `runMenu`'s `options.startPath` instead of the first screen. What `main()`
 * does for a bare command group — `devtools jobs` — at a terminal.
 */
async function resume(
  startPath: string[],
  scripted: unknown[],
  env: Environment = UNKNOWN_ENVIRONMENT,
  startFlags: string[] = [],
): Promise<string[] | null> {
  answers.length = 0;
  asked.length = 0;
  shown.length = 0;
  answers.push(...scripted);

  let dispatched: string[] | null = null;
  await runMenu(
    catalog,
    (argv) => {
      dispatched = argv;
      return Promise.resolve("Done.");
    },
    env,
    { startPath, startFlags },
  );
  return dispatched;
}

/** The answers that select a command, before any option question. */
function answersFor(path: string[]): unknown[] {
  return path.map((_, depth) => findCommand(path.slice(0, depth + 1))!);
}

beforeEach(() => {
  answers.length = 0;
  asked.length = 0;
  shown.length = 0;
});

describe("reach", () => {
  /**
   * The coverage claim, exercised rather than asserted about: walk to every
   * leaf in the tree, declining every optional question, and check that the
   * argv names that exact command.
   */
  it("reaches every interactive command in the tree", async () => {
    const leaves = allPaths().filter((path) => {
      const node = findCommand(path);
      return (
        (node?.subcommands ?? []).length === 0 && node?.surface !== "cli-only"
      );
    });
    expect(leaves.length).toBeGreaterThan(20);

    for (const path of leaves) {
      const node = findCommand(path)!;

      // Enough "no"s and blanks to decline every option prompt on the way out.
      //
      // Promptless options are FILTERED OUT rather than mapped to `undefined`.
      // The wizard never asks about them (see `CommandOption.prompt`), so an
      // entry for one is an extra answer that shifts every later prompt onto
      // the wrong value — a `false` reaching a text prompt, which fails as
      // `unwrap(...).trim is not a function` rather than as anything readable.
      // It stayed hidden while every promptless flag happened to sit last in
      // its command's list.
      const declines = (node.options ?? []).flatMap((option): unknown[] => {
        const { prompt } = option;
        if (!prompt) return [];
        if (prompt.kind === "confirm") return [false];
        if (prompt.kind === "text") return [""];

        return [prompt.choices[0]!.value];
      });

      const argv = await walk([...answersFor(path), ...declines]);

      expect(argv, path.join(" ")).not.toBeNull();
      expect(argv!.slice(0, path.length), path.join(" ")).toEqual(path);
    }
  });

  it("never offers a CLI-only command", async () => {
    await walk([]).catch(() => null);
    const labels = shown[0]!.map((entry) => entry.label);
    for (const node of TOP_LEVEL.filter((n) => n.surface === "cli-only")) {
      expect(labels, node.name).not.toContain(node.title ?? node.name);
    }
  });
});

describe("options become argv", () => {
  it("adds a flag when the confirm is answered yes", async () => {
    const argv = await walk([...answersFor(["env", "example"]), true]);
    expect(argv).toEqual(["env", "example", "--check"]);
  });

  it("adds nothing when it is answered no", async () => {
    const argv = await walk([...answersFor(["env", "example"]), false]);
    expect(argv).toEqual(["env", "example"]);
  });

  it("emits a select choice that is a value after its flag", async () => {
    const argv = await walk([...answersFor(["jobs", "list"]), "staging"]);
    expect(argv).toEqual(["jobs", "list", "--tier", "staging"]);
  });
});

describe("the first screen", () => {
  /** The agreed order and wording, top to bottom. */
  const FIRST_SCREEN = [
    ["Set up this checkout", "setup"],
    ["Run a package script", "script"],
    ['Set up "Sign in with DevDogs"', "oauth"],
    ["Troubleshoot my setup", "doctor"],
    ["Restart local Supabase", "restart-stack"],
    ["Create a new migration", "new-migration"],
    ["Apply migrations to the database", "apply-migrations"],
    ["Push Supabase settings", "push-config"],
    ["Background jobs", "jobs"],
    ["Manage local env files", "env"],
    ["Manage platform roles", "roles"],
  ] as const;

  async function firstScreen(env: Environment = UNKNOWN_ENVIRONMENT) {
    await walk([], env).catch(() => null);
    return shown[0]!;
  }

  it("lists every interactive command by title, in order, then Quit", async () => {
    const drawn = await firstScreen();
    expect(asked[0]).toBe("What would you like to do?");
    expect(drawn.map((entry) => entry.label)).toEqual([
      ...FIRST_SCREEN.map(([title]) => title),
      "Quit",
    ]);
  });

  it("leads each hint with the command to type", async () => {
    const drawn = await firstScreen();
    for (const [title, name] of FIRST_SCREEN) {
      const entry = drawn.find((candidate) => candidate.label === title)!;
      expect(entry.hint, title).toMatch(new RegExp(`^${name} · `));
    }
  });

  it("draws no alias, deprecated or CLI-only command", async () => {
    const hints = (await firstScreen()).map((entry) => entry.hint ?? "");
    for (const name of ["cron", "workflows", "run", "preset", "check"]) {
      expect(
        hints.some((hint) => hint.startsWith(`${name} · `)),
        name,
      ).toBe(false);
    }
  });

  it("dispatches a top-level leaf straight from the first screen", async () => {
    expect(await walk(answersFor(["setup"]))).toEqual(["setup"]);
    expect(asked).toEqual(["What would you like to do?"]);
  });

  it("opens a group's own screen under its title", async () => {
    const argv = await walk(answersFor(["jobs", "serve"]));
    expect(argv).toEqual(["jobs", "serve"]);
    expect(asked).toEqual(["What would you like to do?", "Background jobs:"]);
    const serve = shown[1]!.find((entry) => entry.hint?.startsWith("serve · "));
    expect(serve?.label).toBe("Keep a local Workflow runtime open");
  });

  it("returns to the first screen when the reader backs out", async () => {
    const argv = await walk([
      findCommand(["jobs"])!,
      PICK_BACK,
      findCommand(["setup"])!,
    ]);
    expect(argv).toEqual(["setup"]);
    expect(asked).toEqual([
      "What would you like to do?",
      "Background jobs:",
      "What would you like to do?",
    ]);
  });

  it("dispatches nothing when the reader quits", async () => {
    expect(await walk([null])).toBeNull();
  });
});

describe("entered-tier recording", () => {
  // `src/launch.ts` resolves and enters the session's deploy tier BEFORE this
  // module ever runs (see `runMenu`'s own header) — so all that is left for
  // `runMenu` to do is read it back off `process.env.DEPLOY_ENV` and record it
  // for the "run it directly next time" line `reproducibleCommand` builds.
  const savedDeployEnv = process.env.DEPLOY_ENV;
  const savedDevDb = process.env.DEV_DB;
  afterEach(() => {
    if (savedDeployEnv === undefined) delete process.env.DEPLOY_ENV;
    else process.env.DEPLOY_ENV = savedDeployEnv;
    if (savedDevDb === undefined) delete process.env.DEV_DB;
    else process.env.DEV_DB = savedDevDb;
  });

  it("records the ambient DEPLOY_ENV as the entered tier", async () => {
    process.env.DEPLOY_ENV = "staging";
    const { reproducibleCommand } =
      await import("@devdogsuga/cli-core/invocation");
    await walk(answersFor(["restart-stack"]));
    expect(reproducibleCommand()).toBe(
      "pnpm devtools --tier staging restart-stack",
    );
  });

  it("records nothing extra for the development default", async () => {
    delete process.env.DEPLOY_ENV;
    delete process.env.DEV_DB;
    const { reproducibleCommand } =
      await import("@devdogsuga/cli-core/invocation");
    await walk(answersFor(["restart-stack"]));
    expect(reproducibleCommand()).toBe("pnpm devtools restart-stack");
  });

  it("records the qualified selector for a development session with DEV_DB", async () => {
    // Reproducing a session that ANSWERED the development-database question
    // with a bare `pnpm devtools restart-stack` would re-ask it (or refuse,
    // non-interactively) on the same machine — the hint must carry the whole
    // session.
    delete process.env.DEPLOY_ENV;
    process.env.DEV_DB = "remote";
    const { reproducibleCommand } =
      await import("@devdogsuga/cli-core/invocation");
    await walk(answersFor(["restart-stack"]));
    expect(reproducibleCommand()).toBe(
      "pnpm devtools --tier development:remote restart-stack",
    );
  });
});

describe("bareGroupStartPath", () => {
  // What `main()` calls, at a TTY, to decide whether a bare command group
  // should resume the wizard instead of hitting the dispatcher's "which of
  // …?" refusal. Pure and tree-driven, so these assert directly rather than
  // through a scripted walk.
  it("finds a top-level group", () => {
    expect(bareGroupStartPath(catalog, ["jobs"])).toEqual(["jobs"]);
  });

  it("finds a group through its alias", () => {
    expect(bareGroupStartPath(catalog, ["cron"])).toEqual(["cron"]);
  });

  it("returns null for a leaf command", () => {
    expect(bareGroupStartPath(catalog, ["jobs", "run"])).toBeNull();
  });

  it("returns null for an unknown subcommand token", () => {
    expect(bareGroupStartPath(catalog, ["jobs", "bogus"])).toBeNull();
  });

  it("returns null for a bare invocation", () => {
    // The no-argument wizard already covers this path; treating it as a
    // "resume" too would just be the first screen reached a second way.
    expect(bareGroupStartPath(catalog, [])).toBeNull();
  });

  it("returns null for a top-level leaf command", () => {
    expect(bareGroupStartPath(catalog, ["setup"])).toBeNull();
  });

  it("ignores flag values ahead of the group name", () => {
    // `positionals` is what keeps `staging` and `sync` from being misread as
    // subcommand tokens here — the same bug class `args.ts`'s header warns
    // against for `env --file push audit`.
    expect(bareGroupStartPath(catalog, ["jobs", "--tier", "staging"])).toEqual([
      "jobs",
    ]);
    expect(
      bareGroupStartPath(catalog, catalog.canonicalArgv(["cron"])),
    ).toEqual(["jobs"]);
  });

  it("keeps the flags typed beside the group", () => {
    expect(
      bareGroupStartFlags(catalog.canonicalArgv(["cron"]), ["jobs"]),
    ).toEqual(["--kind", "sync"]);
  });
});

describe("resuming at a node", () => {
  // The property `main()` relies on: a walk resumed at a group's path reaches
  // the same leaf, with the same argv, as walking there from the top of the
  // tree — it just skips the screens above that group.
  it("reaches the same leaf as a full walk, skipping the first screen", async () => {
    const full = await walk(answersFor(["jobs", "serve"]));
    expect(full).toEqual(["jobs", "serve"]);

    const resumed = await resume(["jobs"], [findCommand(["jobs", "serve"])!]);
    expect(resumed).toEqual(full);

    // The first question is jobs' own subcommand screen, not the top-level
    // "What would you like to do?" — a resumed walk never opens that one.
    expect(asked[0]).toBe("Background jobs:");
  });

  it("builds the canonical name, carrying an alias's kind to the end", async () => {
    // `devtools cron` at a terminal: `main()` has already turned it into
    // `jobs --kind sync`, and the wizard keeps the kind on the leaf it builds.
    const resumed = await resume(
      ["jobs"],
      [findCommand(["jobs", "serve"])!],
      UNKNOWN_ENVIRONMENT,
      ["--kind", "sync"],
    );
    expect(resumed).toEqual(["jobs", "serve", "--kind", "sync"]);
  });

  it("dispatches nothing when the reader backs out of the resumed screen", async () => {
    expect(await resume(["jobs"], [PICK_BACK])).toBeNull();
  });
});

describe("the deferred env-entry hook", () => {
  // `launch.ts` registers this (`env-entry.ts`'s `setMenuEnvHook`) instead of
  // entering the environment itself for a menu invocation — see `runMenu`'s
  // own header. This is the other half of that contract: `runMenu` must call
  // it right before dispatch, with the CHOSEN leaf's argv, and never call the
  // injected dispatcher twice.
  afterEach(() => {
    // Leftover from a test that never got read (a failure before the walk's
    // end) must not leak into the next one.
    takeMenuEnvHook();
  });

  it("calls the registered hook with the chosen leaf's argv right before dispatch", async () => {
    const seen: { argv?: readonly string[] } = {};
    setMenuEnvHook(async (commandArgv, dispatchCommand) => {
      seen.argv = commandArgv;
      return dispatchCommand();
    });

    const argv = await walk(answersFor(["restart-stack"]));

    expect(argv).toEqual(["restart-stack"]);
    expect(seen.argv).toEqual(["restart-stack"]);
  });

  it("uses the hook's own return value as runMenu's result", async () => {
    setMenuEnvHook(async () => "hook decided this.");

    let dispatched: string[] | null = null;
    answers.length = 0;
    answers.push(...answersFor(["restart-stack"]));
    const result = await runMenu(
      catalog,
      (argv) => {
        dispatched = argv;
        return Promise.resolve("dispatcher's own answer");
      },
      UNKNOWN_ENVIRONMENT,
    );

    expect(result).toBe("hook decided this.");
    // The hook in this test never calls its `dispatchCommand` argument, so
    // the injected dispatcher itself must never run.
    expect(dispatched).toBeNull();
  });

  it("clears the hook after one use — a nested walk does not inherit it", async () => {
    setMenuEnvHook(async (_argv, dispatchCommand) => dispatchCommand());

    await walk(answersFor(["restart-stack"]));

    expect(takeMenuEnvHook()).toBeUndefined();
  });

  it("dispatches directly when no hook is registered — a typed command already entered", async () => {
    // Every other test in this file relies on exactly this: none of them set
    // a hook, and `walk()`'s own dispatcher still runs. This just says so
    // explicitly.
    expect(takeMenuEnvHook()).toBeUndefined();
    const argv = await walk(answersFor(["restart-stack"]));
    expect(argv).toEqual(["restart-stack"]);
  });
});

describe("adapts to the machine", () => {
  const RUNNING: Environment = {
    docker: "yes",
    stack: "yes",
    envFile: "yes",
  };
  const STOPPED: Environment = { docker: "yes", stack: "no", envFile: "yes" };

  /** The entries the first screen drew, for a machine in the given state. */
  async function firstScreen(env: Environment): Promise<Entry[]> {
    await walk([], env).catch(() => null);
    return shown[0] ?? [];
  }

  const labels = (entries: Entry[]): (string | undefined)[] =>
    entries.map((entry) => entry.label);

  it("offers the restart only while the stack is running", async () => {
    expect(labels(await firstScreen(RUNNING))).toContain(
      "Restart local Supabase",
    );
    expect(labels(await firstScreen(STOPPED))).not.toContain(
      "Restart local Supabase",
    );
    // The Supabase jobs that do not need a running stack stay on offer.
    expect(labels(await firstScreen(STOPPED))).toContain(
      "Apply migrations to the database",
    );
  });

  /**
   * The property that keeps a failed probe from becoming a missing command.
   *
   * `docker ps` can time out, Docker can be absent, a future probe can fail in
   * a way nobody predicted. In every one of those cases the menu is the one it
   * was before any of this existed.
   */
  it("hides nothing when it cannot read the machine", async () => {
    const drawn = labels(await firstScreen(UNKNOWN_ENVIRONMENT));
    for (const command of TOP_LEVEL) {
      if (command.surface === "cli-only") continue;
      expect(drawn, command.name).toContain(command.title ?? command.name);
    }
  });

  /**
   * The layers the Supabase jobs cover, told apart on the line.
   *
   * `restart-stack` and `apply-migrations` act on different things: the
   * containers, and the database inside them. A reader choosing between them
   * should not have to already know that.
   */
  it("says which layer each Supabase job acts on, after its name", async () => {
    const drawn = await firstScreen(RUNNING);
    const hintOf = (title: string) =>
      drawn.find((entry) => entry.label === title)?.hint ?? "";

    expect(hintOf("Restart local Supabase")).toMatch(
      /^restart-stack · This machine · /,
    );
    expect(hintOf("Create a new migration")).toMatch(
      /^new-migration · Repo · /,
    );
    expect(hintOf("Apply migrations to the database")).toMatch(
      /^apply-migrations · Database · /,
    );
  });

  it("leaves a command without a scope unlabelled", async () => {
    const drawn = await firstScreen(RUNNING);
    const jobs = drawn.find((entry) => entry.label === "Background jobs");
    expect(jobs?.hint).toBe(`jobs · ${findCommand(["jobs"])!.hint}`);
  });
});

describe("the tree it walks", () => {
  it("has more top-level commands than the old menu had entries", () => {
    // The menu this replaced listed ten. The gap was the bug.
    expect(TOP_LEVEL.length).toBeGreaterThan(10);
  });

  it("never draws an alias as an entry of its own", () => {
    expect(TOP_LEVEL.map((node) => node.name)).not.toContain("cron");
    expect(TOP_LEVEL.map((node) => node.name)).not.toContain("workflows");
  });
});

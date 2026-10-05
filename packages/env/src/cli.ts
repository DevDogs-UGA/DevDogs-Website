/**
 * Single env-loading helper for every workspace script:
 *
 *   with-env [--tier <tier>] <command> [args...] [--tier <tier>]
 *   with-env -c '<shell command>'
 *   with-env --worker <app> [--yes] -- <command> [args...]
 *
 * `--tier` is also taken from the END of the wrapped command, because that is
 * where `pnpm <script> --tier staging` puts it. On a terminal, the questions
 * `askSession` (in `ask.ts`) shares with the devtools launcher are asked:
 * which tier when several tier files are present and none is named, and which
 * development database (remembered in `.env` if you say so) when `.env` names
 * a remote one. With no terminal, an unnamed tier among several is refused.
 *
 * Loads the environment `DEPLOY_ENV` selects, where unset means development
 * means the root `.env`. In development only, it also loads the
 * `.env.generated` overlay when the local Supabase stack is actually listening
 * (see `load.ts` for the probe table). Installed as a bin, so it inherits the
 * calling package's directory and its node_modules/.bin, with no chdir or PATH
 * fixup.
 *
 * The files it loaded are printed to stderr on every run. That is a design
 * requirement, not chattiness: the probe silently decides between the hosted
 * project and a running local container, and which database a command just
 * touched must never be a guess.
 *
 * Use -c when the command needs a value *from* the env files. A $VAR in the
 * script is expanded by pnpm's shell before this helper loads anything, so it
 * would resolve against the ambient environment; quoting it and passing it to
 * -c defers expansion until after the env is loaded. -c runs the string
 * through @yarnpkg/shell, the same JS shell pnpm's shellEmulator uses, so it
 * stays cross-platform.
 *
 * `--worker <app>` additionally writes the app's Worker env (see
 * `worker-env.ts`) to a private mode-0600 file for the life of the command and
 * substitutes its path for any argument spelled `{env-file}`, e.g.
 * `with-env --worker platform -- wrangler dev --env-file {env-file}`.
 * Previewing the production tier asks first (`--yes` when there is no
 * terminal).
 *
 * ⚠️ The `--` there is load-bearing. Node scans a script's WHOLE argv for
 * `--env-file`, not just its own options, and stops only at `--`: without it,
 * the node running this file tries to load the literal `{env-file}` and dies
 * with `node: {env-file}: not found` before any of this code runs.
 *
 * Neither mode spawns a platform shell, so this works on Windows and POSIX.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { UnknownEnvironmentError } from "./targets.js";
import { confirmProduction } from "./confirm.js";
import { ensureGeneratedEnv } from "./generated.js";
import {
  applyDeployTierAliases,
  applyWranglerLocalDatabaseAlias,
  loadEnvironment,
  LocalStackOfflineError,
  MissingEnvFileError,
  probeLocalStack,
} from "./load.js";
import { availableTiers, askSession, SESSION_SELECTORS } from "./session.js";

// ALMOST NOTHING ELSE IS IMPORTED AT THE TOP LEVEL, deliberately.
//
// This wrapper runs in front of roughly fifty package scripts, so every import
// here is paid by every one of them, including the ones that never reach the
// code needing it. Measured on 2026-08-14, `with-env node -e ""` took 560ms
// against 17ms for bare node, and the breakdown was mostly imports the common
// path never used:
//
//   @yarnpkg/shell + @yarnpkg/fslib   +50ms   only `-c` runs a shell
//   @dotenvx/dotenvx (Node API)      +127ms   only some paths load in-process
//   tsx register                      +24ms
//
// So all three stay dynamically imported where they are used. commander is the
// one exception, measured before admitting it: its import costs ~6ms, and on
// 2026-08-15 this rewrite timed at ~210-230ms per `with-env node -e ""`
// against ~200ms for the old hand-rolled parser. commander, the selection
// modules, and the port probe together cost ~10-30ms, cheap enough to keep
// the parsing declarative. Anything heavier gets lazy-imported: a top-level
// import added here for tidiness costs every script in the repository on
// every run.
//
// `./session.js` joins that top-level group for the same reason: it imports
// only `./targets.js` and `./load.js`, both already paid for above, and
// defers `node:fs`/`node:path` inside `availableTiers()` exactly like this
// file's own `findRoot()` does. It adds no new heavy dependency to the
// common path.

// Walk up for the workspace marker rather than assuming a fixed depth, so the
// helper keeps working if this package is ever moved.
function findRoot(from: string): string {
  for (let dir = from; ;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      console.error("with-env: could not locate the monorepo root.");
      process.exit(1);
    }
    dir = parent;
  }
}

// `WITH_ENV_ROOT_FOR_TESTS` is exactly what its name says: `cli.test.ts`
// spawns this real script as a subprocess, and the root walk above would
// otherwise land on the REAL repo root — whose set of `.env*` tier files is
// per-machine state (a contributor who has run `env pull` has three, CI has
// none), so every tier-resolution assertion would pass or fail on whichever
// machine ran it. The override points the subprocess at a synthetic root of
// known fixtures instead. It is announced on stderr on every use, so it can
// never quietly redirect a real invocation: an env-loading tool silently
// reading files from somewhere other than the repo root is exactly the lie
// this package exists to prevent.
const rootOverride = process.env.WITH_ENV_ROOT_FOR_TESTS;
if (rootOverride !== undefined && rootOverride !== "") {
  console.error(
    `with-env: root overridden by WITH_ENV_ROOT_FOR_TESTS=${rootOverride} (tests only)`,
  );
}
const root =
  rootOverride !== undefined && rootOverride !== ""
    ? rootOverride
    : findRoot(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

// `.enablePositionalOptions()` + `.passThroughOptions()` are what make
// commander safe here: the first positional ends option parsing, so in
// `with-env next dev --port 3001` the `--port` belongs to next, not to us.
// Without them commander would eat (or reject) the wrapped command's flags.
//
// There used to be a `--local` option here. It selected `.env.generated`
// before the port probe existed, spent one release as a deprecated no-op, and
// was removed together with the `:local` script variants once the probe alone
// decided local vs hosted. It is NOT kept as a hidden no-op: an old script or
// muscle memory still passing the flag should fail loudly as an unknown
// option, because a flag that looks like it selects the database while
// actually deciding nothing is exactly the silent lie the probe was built to
// remove.
const program = new Command("with-env")
  .enablePositionalOptions()
  .passThroughOptions()
  .option("-c <script>", "run a shell script string with the env loaded")
  .option(
    "--tier <tier>",
    `environment to load (${SESSION_SELECTORS.join(", ")}, ` +
      "or bare development); overrides DEPLOY_ENV",
  )
  .option(
    "--worker <app>",
    "write <app>'s Worker env to a temp file; {env-file} in the command is replaced by its path",
  )
  .option("--yes", "confirm previewing the production tier without asking")
  .argument("[command...]", "command to run with the env loaded")
  .configureOutput({
    // Re-prefix commander's `error:` lines so a rejected flag (e.g. the
    // removed --local) reads as with-env refusing it, not the wrapped command.
    writeErr: (str) =>
      process.stderr.write(str.replace(/^error:/, "with-env:")),
  });

program.parse();
const opts = program.opts<{
  c?: string;
  tier?: string;
  worker?: string;
  yes?: boolean;
}>();
const args = program.args;

// `pnpm -F platform dev --tier staging` appends the flag to the END of the
// script body, so with-env receives `vinext dev --tier staging`: behind the
// positional boundary above, where commander passes it on to the wrapped
// command. Take it back. No command with-env wraps has a `--tier` of its own,
// and the devtools launcher already treats `--tier` as global wherever it
// sits, so this is the same rule. (`-c` scripts have no trailing argv, and
// commander already parses a `--tier` after one.)
let trailingTier: string | undefined;
for (let i = 1; i < args.length; i++) {
  const arg = args[i]!;
  if (arg !== "--tier" && !arg.startsWith("--tier=")) continue;
  const value = arg === "--tier" ? args[i + 1] : arg.slice("--tier=".length);
  if (value === undefined || value === "" || value.startsWith("-")) {
    console.error("with-env: --tier needs a value");
    process.exit(1);
  }
  trailingTier = value;
  args.splice(i, arg === "--tier" ? 2 : 1);
  i--;
}
if (
  trailingTier !== undefined &&
  opts.tier !== undefined &&
  trailingTier !== opts.tier
) {
  console.error(
    `with-env: the script names --tier ${opts.tier} and its arguments name --tier ${trailingTier}`,
  );
  process.exit(1);
}
const explicitTier = opts.tier ?? trailingTier;

const usage =
  "with-env: usage: with-env <command> [args...]\n" +
  "                 with-env -c '<shell command>'";

const shellMode = opts.c !== undefined;
if (shellMode && args.length > 0) {
  console.error("with-env: -c takes a single quoted string\n" + usage);
  process.exit(1);
}
if (shellMode && opts.worker !== undefined) {
  console.error("with-env: --worker takes a command, not -c\n" + usage);
  process.exit(1);
}
if (!shellMode && args.length === 0) {
  console.error(usage);
  process.exit(1);
}

// Running as a bin, the cwd is already the package whose script invoked us.
const cwd = process.cwd();

// Which tier to run under: `--tier` wins outright, then a non-empty
// `DEPLOY_ENV`, then (an ordinary contributor's machine, at most one tier
// file present) the sole tier — the ONE policy in `session.ts`, shared with
// the devtools launcher.
//
// A question is asked ONLY when someone is at the keyboard: stdin AND stdout
// are terminals and CI is unset. `pnpm -F <app> dev` gives the script the
// terminal; `pnpm -r` / `--parallel` pipe stdout to prefix it, so those get a
// refusal (or the probe, below) rather than a hang waiting on stdin nobody
// can type into. `askSession` is shared with the devtools launcher, so both
// ask the same questions: which tier when two or more tier files are present
// and none is named, and which development database when `.env` names a
// remote one and none is chosen yet. That second answer can be remembered as
// `DEV_DB` in `.env` (see `ask.ts`).
//
// This is also what keeps `pnpm devtools` itself working: its launcher sets
// `DEPLOY_ENV` (and `DEV_DB` when it was answered) on every child task, so
// each child resolves without asking again.
//
// ⚠️ `unanswered: "probe"` is a policy choice, not an omission: with nobody
// to ask and nothing remembered, bare development under `with-env` keeps the
// probe deciding the overlay exactly as it always has, even on a machine
// whose `.env` names a remote database. Refusing there would break every
// `pnpm -r` task and CI run on such a machine overnight. The launcher, the
// home of the destructive db commands, refuses instead.
const tierExists = (relPath: string) => existsSync(join(root, relPath));
const canAsk =
  process.stdin.isTTY === true &&
  process.stdout.isTTY === true &&
  process.env.CI !== "true" &&
  process.env.CI !== "1";
const resolution = await askSession({
  root,
  explicit: explicitTier,
  deployEnv: process.env.DEPLOY_ENV,
  devDb: process.env.DEV_DB,
  available: await availableTiers(root, tierExists),
  canAsk,
  unanswered: "probe",
  name: "with-env",
});
if (!resolution.ok) {
  console.error(`with-env: ${resolution.reason}`);
  process.exit(1);
}

// The session wants the local database and the stack is down: offer to start
// it, as the devtools launcher does, through the same `db start` (which also
// writes `.env.generated` and seeds the buckets). Declined, or nobody to ask,
// and the load below refuses with LocalStackOfflineError's own advice.
if (
  canAsk &&
  resolution.tier === "development" &&
  resolution.devDatabase === "local" &&
  !(await probeLocalStack())
) {
  const { cancel, confirm, isCancel } = await import("@clack/prompts");
  const start = await confirm({
    message: "The local Supabase stack is not running. Start it now?",
  });
  if (isCancel(start)) {
    cancel("Cancelled.");
    process.exit(1);
  }
  if (start) {
    const code = await new Promise<number>((done) => {
      spawn("pnpm", ["devtools", "db", "start"], {
        cwd: root,
        env: { ...process.env, DEPLOY_ENV: "development", DEV_DB: "local" },
        stdio: "inherit",
        shell: process.platform === "win32",
      })
        .on("error", () => done(1))
        .on("exit", (exitCode) => done(exitCode ?? 1));
    });
    if (code !== 0) {
      console.error("with-env: `pnpm devtools db start` failed; see above.");
      process.exit(1);
    }
  }
}

if (opts.worker !== undefined) {
  const confirmed = await confirmProduction({
    tier: resolution.tier,
    what: opts.worker,
    yes: opts.yes === true,
    isTTY: Boolean(process.stdin.isTTY),
  });
  if (!confirmed.ok) {
    console.error(`with-env: ${confirmed.reason}`);
    process.exit(1);
  }
}

// The local stack's connection block is written for you when the stack is up
// and the file is missing or stale. Development only, like the overlay itself,
// and not when the session asked for the remote database.
if (resolution.tier === "development" && resolution.devDatabase !== "remote") {
  const generated = await ensureGeneratedEnv({
    root,
    probe: () => probeLocalStack(),
  });
  if (generated.action === "written" || generated.action === "refreshed") {
    console.error(
      `with-env: ${generated.action} ${generated.file} from \`supabase status -o env\`.`,
    );
  } else if (generated.action === "failed") {
    console.error(
      `with-env: could not write .env.generated (${generated.reason}).`,
    );
  }
}

// Decide which files to load, and load them, in one call — selection is
// still separated from loading inside load.ts, but `with-env` no longer
// needs to see the seam. This always happens in-process, even on Windows
// where the *spawn* below still delegates. `root` was already resolved
// above (needed regardless, for the Windows -f paths further down), so it is
// passed through here rather than having loadEnvironment re-walk for
// pnpm-workspace.yaml a second time. The warnings and the loaded-files line
// are ours either way.
// The mandatory stderr line names the QUALIFIED session when one was
// resolved (`development:local`), because "which database a command just
// touched must never be a guess" is the whole reason the line exists.
const sessionLabel =
  resolution.devDatabase === undefined
    ? resolution.tier
    : `${resolution.tier}:${resolution.devDatabase}`;

let env: Record<string, string>;
let envFiles: string[];
try {
  const loaded = await loadEnvironment(
    resolution.tier,
    { devDatabase: resolution.devDatabase },
    { root },
  );
  for (const warning of loaded.warnings) {
    console.error(`with-env: ${warning}`);
  }
  // Required, never a guess: a running local container silently wins over the
  // hosted project, so every run says which files actually won.
  console.error(
    `with-env: loaded ${loaded.files.join(" + ")} (${sessionLabel})`,
  );
  envFiles = loaded.files;
  env = loaded.env;
} catch (err) {
  // A missing file is reported and survived, NOT refused.
  //
  // It used to exit(1), which is why `@devdogsuga/devtools` carried a second
  // entry point. `pnpm devtools` runs under this wrapper, and the commands that
  // run before there IS an environment could only reach the CLI by going around
  // it: `setup`, which creates `.env`, and the two checks CI runs on a clean
  // checkout. That made the wrapper, rather than the command, the thing that
  // decided whether an environment was needed.
  //
  // Now there is one door. A command that genuinely needs a variable still
  // fails, and fails naming the variable: @t3-oss validates the environment at
  // import time and says which key is missing, which is a better error than
  // this one could give. What is gone is the case where a command needing
  // nothing was refused for the absence of a file it would never have read.
  //
  // `UnknownEnvironmentError` is NOT downgraded with it. A missing file is an
  // absence; a `DEPLOY_ENV` naming an environment that does not exist is a
  // typo pointing at the wrong database, and running "as development" because
  // `production` was misspelled is the silent lie this package exists to
  // prevent.
  //
  // That typo is now largely caught earlier: `resolveSessionTier` above
  // already refuses an unrecognised `--tier` or `DEPLOY_ENV` before
  // `loadEnvironment` is ever called. This branch is kept as a backstop
  // regardless — `loadEnvironment` still resolves the tier itself and would
  // throw exactly this for any future caller that reaches it having skipped
  // resolution, and a backstop that silently rotted into dead code is worse
  // than one extra branch.
  if (err instanceof MissingEnvFileError) {
    console.error(`with-env: ${err.message}`);
    console.error("with-env: continuing with no env file loaded.");
    envFiles = [];
    // loadEnvironment threw before building anything. Rebuild the base
    // snapshot and derive the Wrangler alias by hand, the same as its success
    // path would have, so the Windows delegation and the alias still work
    // with no env file loaded.
    env = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value;
    }
    applyWranglerLocalDatabaseAlias(env);
  } else if (err instanceof LocalStackOfflineError) {
    // NOT survivable the way a missing file is: this session explicitly
    // asked for the local database (a flag, or an inherited `DEV_DB`), and
    // continuing on `.env` alone is how a hosted DB_URL ends up behind a
    // command that asked for the Docker stack.
    console.error(`with-env: ${err.message}`);
    process.exit(1);
  } else if (err instanceof UnknownEnvironmentError) {
    console.error(`with-env: ${err.message}`);
    process.exit(1);
  } else {
    throw err;
  }
}

// After the load, so a file-declared `CLOUDFLARE_ENV` counts as explicit too.
// Covers the missing-file path as well: the tier is known either way.
applyDeployTierAliases(env, resolution.tier);

// Name the session for the command, so a nested `with-env` (or a devtools
// run) resolves to the same tier instead of asking again or refusing.
env.DEPLOY_ENV = resolution.tier;
if (resolution.devDatabase !== undefined) {
  env.DEV_DB = resolution.devDatabase;
}

/**
 * dotenvx's CLI entry point, resolved through its package rather than a `.bin`
 * shim: Node refuses to spawn `.cmd` without a shell, so the shim is not
 * something we can exec directly.
 */
function dotenvxCli(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve("@dotenvx/dotenvx/package.json");
    const { bin } = require("@dotenvx/dotenvx/package.json") as {
      bin?: string | Record<string, string | undefined>;
    };
    const entry = typeof bin === "string" ? bin : bin?.dotenvx;
    if (!entry) throw new Error("no bin entry");
    return join(dirname(pkgPath), entry);
  } catch {
    console.error(
      "with-env: cannot find @dotenvx/dotenvx — run `pnpm install` at the repo root.",
    );
    process.exit(1);
  }
}

// -c: evaluate the string with @yarnpkg/shell so $VAR resolves against the
// loaded files rather than against whatever pnpm's shell had already expanded.
if (shellMode && opts.c !== undefined) {
  const [{ npath }, { execute }] = await Promise.all([
    import("@yarnpkg/fslib"),
    import("@yarnpkg/shell"),
  ]);
  process.exit(
    await execute(opts.c, [], {
      // @yarnpkg/shell works in portable (forward-slash) paths; on Windows a
      // native path would not round-trip. This is a no-op on POSIX.
      cwd: npath.toPortablePath(cwd),
      env,
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
    }),
  );
}

// One process instead of two.
//
// This used to spawn dotenvx's CLI and have IT spawn the command, which meant a
// second Node startup plus dotenvx's own boot (commander, conf, systeminfo) on
// every invocation, 238ms of the 560ms measured above. Loading in-process and
// spawning the command directly removes that.
//
// ⚠️ WINDOWS STILL DELEGATES, and the reason is not stylistic. Since
// CVE-2024-27980 Node refuses to spawn `.cmd`/`.bat` without a shell, and on
// Windows every `node_modules/.bin` entry is a `.cmd` shim, so a direct spawn
// of `next` or `tsx` there fails outright. dotenvx uses execa, which handles it.
// `shell: true` is not the fix: it would break on any path containing a space,
// which on Windows is the ordinary case (`C:\Users\Firstname Lastname\...`).
const windows = process.platform === "win32";

// `--worker`: the file lives exactly as long as the command. Scoped to the
// app's manifest and written AFTER the tier's env loaded, so it carries that
// tier's values. SIGINT/SIGTERM are caught so the credential-bearing file is
// removed by the exit handler below instead of dying with the process.
let workerEnvFile: { path: string; remove: () => void } | undefined;
if (opts.worker !== undefined) {
  const [{ loadAppRegistry }, { buildWorkerEnv }, { writeWranglerEnvFile }] =
    await Promise.all([
      import("./app-registry.js"),
      import("./worker-env.js"),
      import("./wrangler-env.js"),
    ]);
  try {
    const registry = await loadAppRegistry(cwd);
    workerEnvFile = await writeWranglerEnvFile(
      buildWorkerEnv(opts.worker, env, "dev", registry).env,
    );
  } catch (err) {
    console.error(
      `with-env: --worker ${opts.worker}: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
  env.WORKER_ENV_FILE = workerEnvFile.path;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "{env-file}") args[i] = workerEnvFile.path;
  }
}

// `env` was already loaded once, up front, on both platforms (see above).
// dotenvx is used below only as the .cmd-safe process launcher on Windows,
// not as a second loader.

const child = spawn(
  windows ? process.execPath : args[0]!,
  windows
    ? [
        dotenvxCli(),
        "run",
        "--quiet",
        // With no file selected, dotenvx would fall back to looking for its
        // own default `.env` and print a MISSING_ENV_FILE banner for the
        // absence this wrapper has already reported in its own words. The
        // delegation is still needed here because it is what spawns a `.cmd`
        // shim, so silence the duplicate rather than skipping the hop.
        ...(envFiles.length === 0 ? ["--ignore=MISSING_ENV_FILE"] : []),
        ...envFiles.flatMap((f) => ["-f", join(root, f)]),
        "--",
        ...args,
      ]
    : args.slice(1),
  { cwd, env, stdio: "inherit" },
);

child.on("error", (err: Error) => {
  workerEnvFile?.remove();
  console.error(`with-env: ${err.message}`);
  process.exit(1);
});
if (workerEnvFile !== undefined) {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    // The child gets a terminal's SIGINT itself; a bare `kill` only reaches us.
    process.on(signal, () => child.kill(signal));
  }
}

child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
  workerEnvFile?.remove();
  if (signal) {
    // Our forwarding listener would swallow the re-raised signal.
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  } else process.exit(code ?? 1);
});

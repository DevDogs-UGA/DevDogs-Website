/**
 * `db <subcommand> …`, the merged Supabase/Database group.
 *
 * One dispatcher, replacing the flat `isStackCommand`/`isDbCommand` checks
 * that used to sit in the CLI's dispatcher directly: every verb below
 * (`start`, `migrate`, `types`, `seed roles`, `planner status`, …) used to be
 * its own top-level command, so a bare `push` told the reader nothing about
 * what it touched. Nesting them under `db` is what lets `--help db` and the
 * wizard group them by `scope` (see `catalog.ts`) instead of listing all of
 * them flat. `planner` keeps its own dispatcher in `planner/commands.ts`; this
 * just routes to it one level deeper.
 */
import { confirm, log } from "@clack/prompts";
import { flagValue } from "@devdogsuga/cli-core/args";
import {
  describeDbTarget,
  isLocalConnection,
  resolveDbConnection,
  type DbConnection,
} from "@devdogsuga/cli-core/db/connection";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { loadEnv } from "@devdogsuga/cli-core/repo/peers";
import { bail, explain, explainError, unwrap } from "@devdogsuga/cli-core/ui";
import { catalog } from "../catalog.js";
import { runPlannerCommand } from "../planner/commands.js";
import { runConfigPush } from "./config-push.js";
import { runDbExec } from "./exec.js";
import { runGenerateTypes } from "./generate-types.js";
import { runIntrospect } from "./introspect.js";
import { runNewMigration } from "./new-migration.js";
import { runSeedBuckets } from "./seed-buckets.js";
import { runSeedProduction } from "./seed-production.js";
import { runSeedRoles } from "./seed-roles.js";
import {
  connectRemoteProject,
  runStackCommand,
  type StackCommand,
} from "./stack.js";

/**
 * The retired flags a `db` invocation can still carry from muscle memory or
 * an old script. Refused loudly, never ignored: a flag that looks like it
 * selects the database while actually deciding nothing is exactly the
 * silent lie the session vocabulary replaced. The session (`--tier
 * development:local|development:remote|staging|production`, settled by the
 * launcher before dispatch) is the ONE selector now.
 */
function refuseRetiredDbFlags(rest: readonly string[]): boolean {
  for (const flag of ["--target", "--team"]) {
    if (rest.includes(flag)) {
      process.stderr.write(
        `devtools db: ${flag} is retired. The session already names the ` +
          "database — relaunch with --tier development:local, " +
          "development:remote, staging, or production.\n",
      );
      process.exitCode = 1;
      return true;
    }
  }
  return false;
}

async function runStack(command: StackCommand, rest: string[]): Promise<void> {
  // The data commands need the session's connection before anything else —
  // including before the reset confirmation below, which has to name what it
  // is about to erase. The lifecycle commands (`start`/`stop`/`restart`)
  // skip resolution outright: they act on this machine's containers, and
  // `db start` is the FIX for the very state resolution would refuse on.
  // `status` resolves quietly and treats "nothing resolvable" as an answer.
  let connection: DbConnection | null = null;
  if (command === "migrate" || command === "reset") {
    connection = await resolveDbConnection({ label: `devtools db ${command}` });
    if (!connection) {
      process.exitCode = 1;
      return;
    }
  } else if (command === "status") {
    connection = await resolveDbConnection({ quiet: true });
  }

  // `reset` drops everything, and a non-local `migrate` pushes straight to a
  // shared database — both worth a question before they run. The local stack
  // gets the harmless-sounding question, every hosted database a harder one
  // naming exactly which, and production the hardest of all.
  const local = connection !== null && isLocalConnection(connection);
  if (
    connection !== null &&
    (command === "reset" || (command === "migrate" && !local))
  ) {
    if (!local) {
      // Named up front, and ONLY the tier/host and project — never the
      // DB_URL, which carries the password — so whoever is about to answer
      // "yes" knows exactly what they are agreeing to.
      log.message(
        `This will ${command === "reset" ? "reset" : "push migrations to"} ${describeDbTarget(connection)}` +
          (connection.projectRef
            ? ` (project ${connection.projectRef}).`
            : "."),
      );
    }

    // ⚠️ SAFETY: gates every branch below, including production — `--yes` is
    // the ONE way past any of them, checked before anything TTY-dependent
    // runs. clack's `confirm()` never resolves without a TTY (reproduced
    // against @clack/core@1.4.3), so a non-interactive caller without --yes
    // must be refused outright rather than left to hang forever on a prompt
    // nobody is there to answer.
    if (!rest.includes("--yes")) {
      if (!process.stdin.isTTY) {
        process.stderr.write(
          `devtools db ${command}: --yes is required to run non-interactively.\n`,
        );
        process.exitCode = 1;
        return;
      }

      if (connection.tier === "production") {
        // Production gets the sternest wording of the three: this is the one
        // database in this whole CLI that must never be touched by a
        // reflexive keystroke.
        const confirmed = unwrap(
          await confirm({
            message:
              (command === "reset"
                ? "This PERMANENTLY ERASES the PRODUCTION database "
                : "This pushes new migrations to the PRODUCTION database ") +
              `(project ${connection.projectRef ?? "unknown"}). Continue?`,
            initialValue: false,
          }),
        );
        if (!confirmed) bail("Left the database alone.");
      } else {
        const confirmed = unwrap(
          await confirm({
            message:
              command === "reset"
                ? local
                  ? "This erases your local database and rebuilds it. Continue?"
                  : `This erases ${describeDbTarget(connection)} and rebuilds it. Continue?`
                : `This pushes new migrations to ${describeDbTarget(connection)}. Continue?`,
            initialValue: local,
          }),
        );
        if (!confirmed) bail("Left the database alone.");
      }
    }
  }

  try {
    const { code, lines } = await runStackCommand(command, connection);
    for (const line of lines) log.message(line);
    if (code !== 0) {
      // Lines on a failure ARE the explanation, which is the contract with
      // `runStackCommand`. "Scroll up for the Supabase CLI's output" is only
      // true when a delegated script ran, and pointing a reader at output that
      // does not exist is worse than adding nothing. A failure with scrollback
      // worth reading says so in its own line.
      if (lines.length === 0) {
        explain(`\`${command}\` did not finish cleanly.`, "", [
          "Scroll up for the output from the Supabase CLI.",
        ]);
      }
      process.exitCode = code;
    }
  } catch (err) {
    explainError(`\`${command}\` failed.`, err);
    process.exitCode = 1;
  }
}

/**
 * `db <subcommand> …` — the merged Supabase/Database group.
 *
 * One dispatcher, replacing the flat `isStackCommand`/`isDbCommand` checks
 * that used to sit in `dispatch` directly: every verb below (`start`,
 * `migrate`, `types`, `seed roles`, `planner status`, …) used to be its own
 * top-level command, so a bare `push` told the reader nothing about what it
 * touched. Nesting them under `db` is what lets `--help db` and the wizard
 * group them by `scope` (see `commands.ts`) instead of listing all of them
 * flat. `planner` keeps its own dispatcher unchanged; this just routes to it
 * one level deeper.
 */
async function runDbCommand(rest: string[]): Promise<void> {
  const { fileFor } = await loadEnv();
  if (refuseRetiredDbFlags(rest)) return;

  const [sub, ...subRest] = rest;

  if (sub === "connect") {
    const ref = subRest.find((arg) => !arg.startsWith("-"));
    const code = await connectRemoteProject(ref);
    process.exitCode = code === 0 ? 0 : 1;
    return;
  }

  if (
    sub === "start" ||
    sub === "stop" ||
    sub === "restart" ||
    sub === "status" ||
    sub === "migrate" ||
    sub === "reset"
  ) {
    await runStack(sub, subRest);
    return;
  }

  if (sub === "migration") {
    const [msub, ...mrest] = subRest;

    if (msub === "new") {
      // Skip `--app`'s own value, so `new --app <slug> "<description>"`
      // doesn't take the slug for the description.
      const appAt = mrest.indexOf("--app");
      const positional = mrest.filter(
        (arg, i) => !arg.startsWith("-") && !(appAt >= 0 && i === appAt + 1),
      );
      const code = await runNewMigration(
        flagValue(mrest, "--app"),
        positional[0],
      );
      process.exitCode = code === 0 ? 0 : 1;
      return;
    }
    log.error(
      msub
        ? `devtools db migration: unknown subcommand "${msub}". Try ${catalog.subcommandList(["db", "migration"])}.`
        : `devtools db migration: which of ${catalog.subcommandList(["db", "migration"])}?`,
    );
    process.exitCode = 1;
    return;
  }

  if (sub === "types") {
    const connection = await resolveDbConnection({
      label: "devtools db types",
    });
    if (!connection) {
      process.exitCode = 1;
      return;
    }
    const code = await runGenerateTypes(connection.dbUrl);
    process.exitCode = code === 0 ? 0 : 1;
    return;
  }

  if (sub === "seed") {
    const [ssub] = subRest;

    if (ssub === "buckets") {
      const connection = await resolveDbConnection({
        label: "devtools db seed buckets",
      });
      if (!connection) {
        process.exitCode = 1;
        return;
      }
      // `seed buckets` drives the Storage API, which has no `--db-url` mode
      // (see `db/run.ts`), so this is the one data command still keyed on
      // local-vs-hosted rather than handed the session's URL.
      const code = await runSeedBuckets(
        isLocalConnection(connection)
          ? { kind: "local" }
          : { kind: "remote", projectRef: connection.projectRef },
      );
      process.exitCode = code === 0 ? 0 : 1;
      return;
    }
    if (ssub === "roles") {
      const connection = await resolveDbConnection({
        label: "devtools db seed roles",
      });
      if (!connection) {
        process.exitCode = 1;
        return;
      }
      const code = await runSeedRoles(connection.dbUrl);
      process.exitCode = code === 0 ? 0 : 1;
      return;
    }
    if (ssub === "production") {
      const connection = await resolveDbConnection({
        label: "devtools db seed production",
      });
      if (!connection) {
        process.exitCode = 1;
        return;
      }

      // Same non-local gate `runStack` uses for `reset`/`migrate`: named up
      // front (tier/host only, never the DB_URL) and, absent --yes, refused
      // outright for a non-interactive caller rather than left to hang on a
      // prompt nobody is there to answer. `seed production` writes real rows
      // to whatever it targets, so a staging or production session gets the
      // same confirmation those destructive commands do; a local session
      // (the common case — verifying the seed split, or repairing a local
      // stack after `reset --no-seed`) does not, matching `seed
      // buckets`/`seed roles` today.
      if (!isLocalConnection(connection)) {
        log.message(
          `This will write supabase/seed/production/*.sql to ${describeDbTarget(connection)}` +
            (connection.projectRef
              ? ` (project ${connection.projectRef}).`
              : "."),
        );

        if (!subRest.includes("--yes")) {
          if (!process.stdin.isTTY) {
            process.stderr.write(
              "devtools db seed production: --yes is required to run non-interactively.\n",
            );
            process.exitCode = 1;
            return;
          }

          const confirmed = unwrap(
            await confirm({
              message:
                connection.tier === "production"
                  ? "This writes the production seed set to the PRODUCTION database " +
                    `(project ${connection.projectRef ?? "unknown"}). Continue?`
                  : `This writes the production seed set to ${describeDbTarget(connection)}. Continue?`,
              initialValue: false,
            }),
          );
          if (!confirmed) bail("Left the database alone.");
        }
      }

      const code = await runSeedProduction(connection.dbUrl);
      process.exitCode = code === 0 ? 0 : 1;
      return;
    }

    log.error(
      ssub
        ? `devtools db seed: unknown subcommand "${ssub}". Try ${catalog.subcommandList(["db", "seed"])}.`
        : `devtools db seed: which of ${catalog.subcommandList(["db", "seed"])}?`,
    );
    process.exitCode = 1;
    return;
  }

  if (sub === "introspect") {
    const code = await runIntrospect(flagValue(subRest, "--app"));
    process.exitCode = code === 0 ? 0 : 1;
    return;
  }

  if (sub === "config") {
    const [csub] = subRest;

    if (csub === "push") {
      // Hosted-only — `config.toml` is pushed to a project ref, and the
      // Docker stack has none (it reads the file directly at `db start`).
      const connection = await resolveDbConnection({
        label: "devtools db config push",
      });
      if (!connection) {
        process.exitCode = 1;
        return;
      }
      if (isLocalConnection(connection)) {
        process.stderr.write(
          "devtools db config push: the local stack reads config.toml " +
            "directly (`db restart` applies changes). Relaunch with --tier " +
            "development:remote, staging, or production to push it to a " +
            "hosted project.\n",
        );
        process.exitCode = 1;
        return;
      }
      if (!connection.projectRef) {
        process.stderr.write(
          `devtools db config push: ${fileFor(connection.tier)} has no PROJECT_REF.\n`,
        );
        process.exitCode = 1;
        return;
      }
      const code = await runConfigPush(connection.projectRef);
      process.exitCode = code === 0 ? 0 : 1;
      return;
    }

    log.error(
      csub
        ? `devtools db config: unknown subcommand "${csub}". Try ${catalog.subcommandList(["db", "config"])}.`
        : `devtools db config: which of ${catalog.subcommandList(["db", "config"])}?`,
    );
    process.exitCode = 1;
    return;
  }

  if (sub === "planner") {
    await runPlannerCommand(subRest);
    return;
  }

  if (sub === "exec") {
    const execArgs = subRest[0] === "--" ? subRest.slice(1) : subRest;
    const code = await runDbExec(execArgs);
    process.exitCode = code === 0 ? 0 : 1;
    return;
  }

  log.error(
    sub
      ? `devtools db: unknown subcommand "${sub}". Try ${catalog.subcommandList(["db"])}.`
      : `devtools db: which of ${catalog.subcommandList(["db"])}?`,
  );
  process.exitCode = 1;
}

export const handleDb: CommandHandler = async (rest) => {
  await runDbCommand(rest);
  return DONE;
};

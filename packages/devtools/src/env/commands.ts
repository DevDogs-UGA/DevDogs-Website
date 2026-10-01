/**
 * `pnpm devtools env <example|init|reset>`: the env commands that touch no
 * remote store.
 *
 * `pull`, `push` and `audit` always need production secrets and live in
 * `@devdogsuga/backstage` (`backstage env pull|push|audit`).
 */
import { flagValue, positionals } from "@devdogsuga/cli-core/args";
import { loadRegistry } from "@devdogsuga/cli-core/env/discovery";
import { pathFor, readDocument, save } from "@devdogsuga/cli-core/env/files";
import { fingerprint } from "@devdogsuga/cli-core/env/fingerprint";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { confirm, log, note } from "@clack/prompts";
import { loadEnv } from "@devdogsuga/cli-core/repo/peers";
import { catalog } from "../catalog.js";
import { runEnvExample, runEnvInit } from "./example.js";
import { bail, explain, explainError, unwrap } from "@devdogsuga/cli-core/ui";

export interface EnvOptions {
  /** Overrides the file the target implies. */
  file?: string;
  yes?: boolean;
}

/**
 * Empties every value in a local env file, losing none of them.
 *
 * The use is handing a filled-in file back to its blank state: after pulling
 * production onto a laptop, before passing a machine on, or when a set of keys
 * has to be re-entered from scratch. Deleting the values would do that too, and
 * would also delete the only copy of anything that was never pushed. So each
 * becomes a commented line holding what it was, plus an empty active line
 * beneath. The file still declares every key it needs, which makes it a
 * checklist rather than a blank page.
 *
 * Purely local. It touches no remote store, so it takes no `--target`: asking
 * which target to clear a file against would imply it reaches one. It works on
 * `.env` unless `--file` says otherwise, and that default is written out here
 * rather than inherited, so the shared `pathFor` has no "no target" case for a
 * remote command to fall into.
 */
export async function runEnvReset(options: EnvOptions): Promise<void> {
  const path = pathFor("development", options.file);
  const doc = await readDocument(path);

  const active = doc.entries().filter(([, value]) => value !== "");
  if (active.length === 0) {
    log.success(`Nothing to clear — every value in ${path} is already empty.`);
    return;
  }

  note(
    active
      .map(([key, value]) => `~ ${key}  ${fingerprint(value)} → empty`)
      .join("\n"),
    `${path} will be cleared`,
  );

  if (!options.yes) {
    const ok = unwrap(
      await confirm({
        message: `Clear ${active.length} value(s)? Each is kept, commented out, on the line above.`,
        initialValue: false,
      }),
    );
    if (!ok) bail("Nothing written.");
  }

  const cleared = doc.reset();
  await save(path, doc);

  log.success(`Cleared ${cleared.length} value(s) in ${path}.`);
  log.info(
    "Every previous value is still in the file, commented out. `env pull` " +
      "will fill them back in from Bitwarden.",
  );
}

async function runEnvCommand(rest: string[]): Promise<void> {
  const { ENV_TARGETS, isEnvTarget } = await loadEnv();
  // `positionals` rather than `rest[0]`, so a flag before the subcommand does
  // not become the subcommand -- and, more to the point, so the VALUE of a flag
  // never does: in `env --file production pull`, `production` is a filename and
  // must not be read as anything else.
  const [sub] = positionals(rest);

  // Validated against the command tree rather than a list kept here. One
  // declaration means a subcommand cannot exist in the CLI and be missing
  // from the menu, or the reverse.
  if (!sub || !catalog.subcommandNames(["env"]).includes(sub)) {
    log.error(`Unknown env subcommand: ${sub ?? "(none)"}`);
    log.message(`Try ${catalog.subcommandList(["env"])}.`);
    process.exitCode = 1;
    return;
  }

  // `reset` only edits a local file. Asking which target to clear it against
  // would imply it reaches one, which is the opposite of what it does.
  if (sub === "reset") {
    try {
      await runEnvReset({
        file: flagValue(rest, "--file"),
        yes: rest.includes("--yes"),
      });
    } catch (err) {
      explainError("The reset failed.", err);
      process.exitCode = 1;
    }
    return;
  }

  // Every remaining subcommand reads the registry, which fills only when the
  // env manifests are imported. Loaded HERE, lazily, rather than at CLI
  // start: the import pass touches a manifest in nearly every workspace
  // package, and `pnpm devtools db reset` (or any stack command) should not pay
  // for declarations it never reads. `env reset` returned above for the
  // same reason: it edits the local file and consults no key set.
  await loadRegistry();

  // `example` and `init` are pure registry → text. They return BEFORE the
  // Bitwarden token lookup and the pull/push target prompt, and must
  // keep doing so: CI's credential-free validate job runs `example --check`,
  // and a generator that needed a secret to describe the secrets could not
  // live there.
  if (sub === "example") {
    try {
      await runEnvExample({ check: rest.includes("--check") });
    } catch (err) {
      explainError("Generating .env.example failed.", err);
      process.exitCode = 1;
    }
    return;
  }

  if (sub === "init") {
    // Every target, including `development` and `preflight`: init maps target
    // → file and nothing else, and every target has a file. It is the one
    // subcommand here that needs no Bitwarden project, though WHAT it writes
    // now depends on the target. See `example.ts`'s header for why a vault
    // target's file is not the development one under a different name.
    const given = flagValue(rest, "--target") ?? "development";
    if (!isEnvTarget(given)) {
      explain(`"${given}" is not a target init can create a file for.`, "", [
        `Pass --target ${ENV_TARGETS.join(" | ")} (default: development).`,
      ]);
      process.exitCode = 1;
      return;
    }
    try {
      // `--apps` (development only): which projects' sections to render, as
      // comma-separated app names, plus `devtools` for the operator role.
      // Absent at a terminal, init asks; absent in a pipe, it renders
      // everything, which is what every pre-picker caller got.
      await runEnvInit(given, flagValue(rest, "--apps") ?? undefined);
    } catch (err) {
      explainError("env init failed.", err);
      process.exitCode = 1;
    }
    return;
  }
}

export const handleEnv: CommandHandler = async (rest) => {
  await runEnvCommand(rest);
  return DONE;
};

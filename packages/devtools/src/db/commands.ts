/**
 * `db <start|types|introspect>`: deprecated aliases, kept until the cutover.
 *
 * DevDogsUGA's `main` still calls these (its CI starts the stack and
 * regenerates types, and the drizzle configs name `db introspect`). Each
 * prints what replaces it on stderr, then does what it always did. The rest of
 * the old `db` namespace is gone; see `catalog.ts`.
 */
import { log } from "@clack/prompts";
import { flagValue } from "@devdogsuga/cli-core/args";
import { resolveDbConnection } from "@devdogsuga/cli-core/db/connection";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { loadEnv } from "@devdogsuga/cli-core/repo/peers";
import { catalog } from "../catalog.js";
import { runGenerateTypes } from "./generate-types.js";
import { runIntrospect } from "./introspect.js";
import { runStackCommand } from "./stack.js";

function deprecation(sub: string): void {
  const replacement = catalog.findCommand(["db", sub])?.deprecated;
  if (replacement) {
    process.stderr.write(`devtools db ${sub} is deprecated. ${replacement}\n`);
  }
}

async function runDbCommand(rest: string[]): Promise<void> {
  // Loads the env peers up front, as the whole group did.
  await loadEnv();
  const [sub, ...subRest] = rest;

  if (sub === "start") {
    deprecation(sub);
    const { code, lines } = await runStackCommand("start");
    for (const line of lines) log.message(line);
    process.exitCode = code === 0 ? 0 : 1;
    return;
  }

  if (sub === "types") {
    deprecation(sub);
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

  if (sub === "introspect") {
    deprecation(sub);
    const code = await runIntrospect(flagValue(subRest, "--app"));
    process.exitCode = code === 0 ? 0 : 1;
    return;
  }

  log.error(
    sub
      ? `devtools db: "${sub}" is gone. Only ${catalog.subcommandList(["db"])} remain, as deprecated aliases.`
      : `devtools db: which of ${catalog.subcommandList(["db"])}? (deprecated aliases)`,
  );
  process.exitCode = 1;
}

export const handleDb: CommandHandler = async (rest) => {
  await runDbCommand(rest);
  return DONE;
};

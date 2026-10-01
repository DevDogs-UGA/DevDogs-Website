/**
 * `docs index`, the documentation search index.
 */
import { log } from "@clack/prompts";
import { flagValue, positionals } from "@devdogsuga/cli-core/args";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { catalog } from "../catalog.js";
import { runDocsIndex } from "./index-pages.js";

/**
 * `docs index [--target <local|remote>]`, the documentation search index.
 *
 * One subcommand today, and a group rather than a top-level `docs-index`
 * because the artifact it reads has more than one thing worth doing to it
 * (a `--check` that reports drift is the obvious next one).
 */
async function runDocsCommand(rest: string[]): Promise<void> {
  const [sub] = positionals(rest);

  if (!sub || !catalog.subcommandNames(["docs"]).includes(sub)) {
    log.error(
      sub
        ? `devtools docs: unknown subcommand "${sub}". Try ${catalog.subcommandList(["docs"])}.`
        : `devtools docs: which subcommand? Try ${catalog.subcommandList(["docs"])}.`,
    );
    process.exitCode = 1;
    return;
  }

  // `docs index`'s `--target remote` is NOT the retired db selector: it is
  // the explicit acknowledgment its destructive delete requires when DB_URL
  // is not local (see `docs/index-pages.ts`). The database itself still
  // comes from the session's DB_URL like everything else.
  const target = flagValue(rest, "--target") === "remote" ? "remote" : "local";
  await runDocsIndex({ target });
}

export const handleDocs: CommandHandler = async (rest) => {
  await runDocsCommand(rest);
  return DONE;
};

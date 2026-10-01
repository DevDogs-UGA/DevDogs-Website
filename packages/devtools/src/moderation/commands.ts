/**
 * `moderation check [--app <slug>]`: the report reasons and moderatable
 * content types, or one app's `platform.conformance_check()`.
 */
import { log, note, spinner } from "@clack/prompts";
import { flagValue } from "@devdogsuga/cli-core/args";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { resolveInstance, type Instance } from "@devdogsuga/cli-core/instance";
import { explainError, renderChecks } from "@devdogsuga/cli-core/ui";
import { catalog } from "../catalog.js";
import { refuseUnlessDevelopment } from "../persona/commands.js";
import { conformance, withTemporaryModerator } from "./checks.js";
import { readCatalog, renderCatalog } from "./read-catalog.js";

/**
 * `moderation check [--app <slug>]`.
 *
 * With no app, this is what `moderation catalog` used to be on its own: the
 * report reasons and every app's moderatable content types, the two halves
 * of "what can be reported here" that used to have no answer anywhere but
 * the database. With one, it runs `platform.conformance_check()` for that
 * app, as it always did. Folded into one command because they were always
 * the same question at two different zoom levels, asked through two
 * differently-named commands for no reason better than history.
 *
 * Both halves run inside ONE `withTemporaryModerator` — one throwaway
 * account, created and torn down around whichever half ran, rather than a
 * separate one per RPC call.
 */
async function runModerationCheck(
  instance: Instance,
  appSlug?: string,
): Promise<void> {
  if (!appSlug) {
    const s = spinner();
    s.start("Signing in as a temporary moderator");
    try {
      const catalog = await withTemporaryModerator(instance, readCatalog);
      s.stop("Read the catalog");
      note(renderCatalog(catalog), "Moderation catalog");
    } catch (err) {
      s.stop("Could not read the catalog");
      explainError("Reading the catalog failed.", err);
      process.exitCode = 1;
    }
    return;
  }

  const s = spinner();
  s.start(`Checking ${appSlug}`);

  let types: Awaited<ReturnType<typeof conformance>>;
  try {
    types = await withTemporaryModerator(instance, (client) =>
      conformance(client, appSlug),
    );
    s.stop(`Checked ${appSlug}`);
  } catch (err) {
    s.stop("The check could not run");
    explainError("conformance_check() failed.", err);
    process.exitCode = 1;
    return;
  }

  if (types.length === 0) {
    note(
      `${appSlug} has no moderatable content types.\n\n` +
        "A table becomes one by carrying a foreign key to\n" +
        'platform."reportResolutions" -- adding that column is the whole\n' +
        "registration. See docs/platform/reporting-and-feedback.md.",
      "Nothing to check",
    );
    return;
  }

  let failures = 0;
  for (const type of types) {
    const failed = type.checks.filter((c) => !c.ok).length;
    failures += failed;
    note(
      renderChecks(type.checks),
      `${type.tableName} → "${type.contentType}"`,
    );
  }

  if (failures === 0) {
    log.success(`${appSlug} looks correctly integrated.`);
  } else {
    log.warn(
      `${failures} check${failures === 1 ? "" : "s"} failed. The last two are ` +
        "heuristics over policy text, so a failure there is worth reading rather " +
        "than trusting outright.",
    );
  }
}

export const handleModeration: CommandHandler = async (rest) => {
  const resolved = await resolveInstance({ label: "devtools moderation" });
  if (!resolved) {
    process.exitCode = 1;
    return null;
  }
  if (
    refuseUnlessDevelopment(resolved.connection, "devtools moderation check")
  ) {
    process.exitCode = 1;
    return null;
  }

  const [msub, ...mrest] = rest;
  if (msub === "check") {
    await runModerationCheck(resolved.instance, flagValue(mrest, "--app"));
  } else {
    log.error(
      msub
        ? `devtools moderation: unknown subcommand "${msub}". Try ${catalog.subcommandList(["moderation"])}.`
        : `devtools moderation: which of ${catalog.subcommandList(["moderation"])}?`,
    );
    process.exitCode = 1;
  }
  return DONE;
};

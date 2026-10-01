/**
 * Dispatch for `devtools gen *`.
 *
 * Only `gen campus-map` is left; it moves to the platform's `fetch:campus-map`
 * script with the rest of the DevDogsUGA-side scripts.
 */
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { runGenCampusMap } from "./campus-map.js";

export async function runGen(argv: readonly string[]): Promise<number> {
  const sub = argv[0];

  if (sub === "campus-map") return runGenCampusMap();

  process.stderr.write(
    `devtools gen: unknown subcommand "${sub ?? "(none)"}". ` +
      "Expected: campus-map.\n",
  );
  return 1;
}

export const handleGen: CommandHandler = async (rest) => {
  process.exitCode = await runGen(rest);
  return DONE;
};

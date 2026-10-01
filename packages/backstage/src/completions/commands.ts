import { runCompletions } from "@devdogsuga/cli-core/completions";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { catalog } from "../catalog.js";

export const handleCompletions: CommandHandler = async (rest) => {
  const code = runCompletions(catalog, rest);
  process.exitCode = code;
  return code === 0 ? DONE : null;
};

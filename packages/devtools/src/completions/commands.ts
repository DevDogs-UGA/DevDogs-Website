import { runCompletions } from "@devdogsuga/cli-core/completions";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { activeCatalog } from "../active.js";

export const handleCompletions: CommandHandler = async (rest) => {
  const code = runCompletions(activeCatalog(), rest);
  process.exitCode = code;
  return code === 0 ? DONE : null;
};

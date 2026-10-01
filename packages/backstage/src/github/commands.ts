/**
 * `github rulesets|settings`: the two `gh api` commands (see their own
 * folders). Neither touches a DevDogsUGA env file or database.
 */
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { runGithubRulesets } from "./rulesets/commands.js";
import { runGithubSettings } from "./settings/commands.js";

export const handleGithub: CommandHandler = async (rest) => {
  const sub = rest[0];
  const githubArgs = rest.slice(1);
  let code: number;
  if (sub === "rulesets") {
    code = await runGithubRulesets(githubArgs);
  } else if (sub === "settings") {
    code = await runGithubSettings(githubArgs);
  } else {
    process.stderr.write(
      `backstage github: unknown subcommand "${sub ?? "(none)"}". Expected: rulesets or settings.\n`,
    );
    code = 1;
  }
  process.exitCode = code;
  return code === 0 ? DONE : null;
};

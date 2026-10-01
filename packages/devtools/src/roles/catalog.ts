/**
 * `roles`' place in the command tree: declaration only, nothing here runs.
 * The handlers live in `commands.ts` beside it.
 *
 * `grant` and `revoke` take `<email> <role>` as positionals and ask for
 * whichever is missing, so the wizard reaches them with no arguments and the
 * pickers do the rest. That is why neither declares an option of its own.
 */
import { JSON_FLAG, YES, type CommandNode } from "@devdogsuga/cli-core/catalog";

export const rolesCommand: CommandNode = {
  name: "roles",
  summary: "See who holds each role, and grant or revoke one.",
  hint: "list, grant, revoke",
  subcommands: [
    {
      name: "list",
      dryRun: "read-only",
      summary: "Every role and the accounts that hold it.",
      options: [JSON_FLAG],
    },
    {
      name: "grant",
      summary: "Give an account a role: <email> <role>.",
      hint: "President moves from its current holder",
      options: [YES],
    },
    {
      name: "revoke",
      summary: "Take a role from an account: <email> <role>.",
      options: [YES],
    },
  ],
};

/** `grant-root`, kept until the docs and shell histories have moved. */
export const grantRootCommand: CommandNode = {
  name: "grant-root",
  summary: "Give an account President.",
  hint: "deprecated: roles grant <email> President",
  surface: "cli-only",
  deprecated: "Use `devtools roles grant <email> President`.",
  options: [
    {
      flag: "--user",
      value: "<email>",
      summary: "Account to make President. Asked for when absent.",
    },
    YES,
  ],
};

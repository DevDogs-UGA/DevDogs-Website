/**
 * `creds`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 *
 * Every subcommand is `envFree`: it runs on the officer's own Bitwarden
 * session and reads production only for the roster, through `--db-url` or
 * Secrets Manager, so no env file or tier is entered. Bare `creds` at a
 * terminal opens this group's menu.
 */
import {
  JSON_FLAG,
  YES,
  type CommandNode,
  type CommandOption,
} from "@devdogsuga/cli-core/catalog";

const ITEM: CommandOption = {
  flag: "--item",
  value: "<name>",
  summary: "A Shared Accounts item, by name or id. Repeat for several.",
};

const TO: CommandOption = {
  flag: "--to",
  value: "<a@uga.edu,…>",
  summary: "Recipients, comma-separated. Replaces the item's current list.",
};

const ROLE: CommandOption = {
  flag: "--role",
  value: "<role,…>",
  summary: "Everyone holding these officer roles, added to --to.",
};

const ALLOW_EMAIL: CommandOption = {
  flag: "--allow-email",
  summary: "Accept addresses that are not on the officer roster.",
};

const DB_URL: CommandOption = {
  flag: "--db-url",
  value: "<url>",
  summary:
    "Production connection for the roster. Defaults to .env.production, then Secrets Manager.",
};

const LINEAR_TOKEN: CommandOption = {
  flag: "--linear-token",
  value: "<key>",
  summary: "Linear API key. Prefer LINEAR_API_KEY or the vault item.",
};

const NO_REPORT: CommandOption = {
  flag: "--no-report",
  summary: "Skip regenerating the Shared Accounts Linear document.",
};

export const credsCommand: CommandNode = {
  name: "creds",
  summary: "Share club logins from Bitwarden as email-verified Sends.",
  hint: "your own Bitwarden session; officers only",
  subcommands: [
    {
      name: "send",
      envFree: true,
      summary: "Create or update the Sends for existing shared accounts.",
      hint: "pick accounts, then officers",
      options: [
        ITEM,
        TO,
        ROLE,
        ALLOW_EMAIL,
        DB_URL,
        LINEAR_TOKEN,
        NO_REPORT,
        YES,
      ],
    },
    {
      name: "add",
      envFree: true,
      summary: "Save a new shared login to the collection, then send it.",
      options: [
        {
          flag: "--name",
          value: "<name>",
          summary: "The item's name, e.g. Instagram.",
        },
        { flag: "--url", value: "<url>", summary: "The login page." },
        { flag: "--username", value: "<username>", summary: "The login." },
        {
          flag: "--owner",
          value: "<name>",
          summary: "The officer responsible for the account.",
        },
        {
          flag: "--password-stdin",
          summary: "Read the password from stdin, for scripts.",
        },
        TO,
        ROLE,
        ALLOW_EMAIL,
        DB_URL,
        LINEAR_TOKEN,
        NO_REPORT,
        YES,
      ],
    },
    {
      name: "renew",
      envFree: true,
      summary: "Extend Sends 30 days and re-sync their recipients.",
      hint: "asks first for any with more than 7 days left",
      options: [ITEM, LINEAR_TOKEN, NO_REPORT, YES],
    },
    {
      name: "list",
      envFree: true,
      dryRun: "read-only",
      summary: "Shared accounts, their recipients and when each Send expires.",
      hint: "reads only",
      options: [JSON_FLAG],
    },
    {
      name: "report",
      envFree: true,
      summary: "Regenerate the Shared Accounts Linear document.",
      options: [
        LINEAR_TOKEN,
        {
          flag: "--document",
          value: "<id>",
          summary: "A different Linear document id, for testing.",
        },
      ],
    },
  ],
};

/**
 * `env`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import {
  JSON_FLAG,
  YES,
  type CommandNode,
  type CommandOption,
} from "@devdogsuga/cli-core/catalog";

const VAULT_TARGET: CommandOption = {
  flag: "--target",
  value: "<t>",
  summary: "preflight, staging or production. Asked for when absent.",
  // No prompt: `pick.ts` already owns this question, and it orders the list
  // least- to most-dangerous so a reflexive Enter cannot select production.
  // Duplicating it here would put production one keystroke closer.
};

const ENV_FILE: CommandOption = {
  flag: "--file",
  value: "<path>",
  summary: "Read and write this file instead of the target's own.",
};

const ACCESS_TOKEN: CommandOption = {
  flag: "--access-token",
  value: "<token>",
  summary: "Bitwarden Secrets Manager token. Prefer the vault or the env var.",
};

/**
 * `env pull|push|audit`: the Bitwarden- and GitHub-backed half of `env`.
 * Needs production secrets, so it is the part of this group that moves to the
 * backstage CLI (TASK-399); the rest stays here.
 */
export const envVaultSubcommands: readonly CommandNode[] = [
  {
    name: "pull",
    summary: "Bitwarden → the target's file, in place.",
    options: [VAULT_TARGET, ENV_FILE, YES, ACCESS_TOKEN],
  },
  {
    name: "push",
    summary: "The target's file → Bitwarden and GitHub.",
    options: [VAULT_TARGET, ENV_FILE, YES, ACCESS_TOKEN],
  },
  {
    name: "audit",
    summary: "Compare the file, Bitwarden, GitHub and Cloudflare.",
    hint: "reads only",
    options: [VAULT_TARGET, ENV_FILE, YES, ACCESS_TOKEN, JSON_FLAG],
  },
];

export const envCommand: CommandNode = {
  name: "env",
  summary: "One env file per target, synced to Bitwarden and GitHub.",
  subcommands: [
    ...envVaultSubcommands,
    {
      name: "init",
      summary: "Create a target file, or append newly declared keys.",
      hint: "existing lines are never changed",
      options: [
        {
          flag: "--target",
          value: "<t>",
          summary: "Which file to create. Defaults to development.",
          prompt: {
            kind: "select",
            message: "Create a file for which target?",
            choices: [
              { value: "development", hint: ".env — the default" },
              { value: "preflight", hint: ".env.preflight" },
              { value: "staging", hint: ".env.staging" },
              { value: "production", hint: "⚠️  .env.production" },
            ],
          },
        },
        {
          flag: "--apps",
          value: "<a,b,…>",
          summary: "Which sections to render. Development only; asks.",
        },
      ],
    },
    {
      name: "example",
      summary: "Regenerate .env.example from the manifests.",
      options: [
        {
          flag: "--check",
          summary: "Verify it is current, as CI does. Writes nothing.",
          prompt: {
            kind: "confirm",
            message: "Check only, without rewriting .env.example?",
            initial: true,
          },
        },
      ],
    },
    {
      name: "reset",
      summary: "Blank every value in .env, keeping each commented out.",
      hint: "local only, no target",
      options: [ENV_FILE, YES],
    },
  ],
};

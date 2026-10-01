/**
 * `env`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import {
  YES,
  type CommandNode,
  type CommandOption,
} from "@devdogsuga/cli-core/catalog";

const ENV_FILE: CommandOption = {
  flag: "--file",
  value: "<path>",
  summary: "Read and write this file instead of the target's own.",
};

export const envCommand: CommandNode = {
  name: "env",
  summary: "Create, regenerate and clear the local env files.",
  subcommands: [
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
      // Reads the manifests, never an env file or a database, so it needs no
      // tier (CI runs it with none).
      envFree: true,
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

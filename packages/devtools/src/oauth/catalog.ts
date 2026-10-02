/**
 * `oauth`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import { type CommandNode } from "@devdogsuga/cli-core/catalog";

export const oauthCommand: CommandNode = {
  name: "oauth",
  title: 'Set up "Sign in with DevDogs"',
  summary: 'Configure "Sign in with DevDogs" for this directory.',
  hint: "works outside a DevDogsUGA checkout too",
  // Talks only to whatever local Supabase project is running in `cwd`
  // (see `oauth/db.ts`'s `detectLocalSupabase`) and, for a hosted
  // target, to the platform's own OAuth endpoints — never a
  // DevDogsUGA env file, database, or `DEPLOY_ENV`. TASK-345: a
  // workshop repo with no DevDogsUGA checkout at all must still be
  // able to run `pnpm dlx @devdogsuga/devtools oauth`, so this joins
  // the `check` commands in the catalog-driven bypass
  // rather than the hardcoded `setup`/`completions` check — see
  // `launch.ts`'s `isEnvFreeCommand`. Inside a checkout, the command's
  // own hosted-target path still resolves a tier itself, lazily, only
  // when a hosted target is actually chosen (see `oauth/wizard.ts`).
  envFree: true,
  options: [
    {
      flag: "--base-url",
      value: "<url>",
      summary:
        'DevDogs API URL for "Paste credentials instead". Defaults to https://api.devdogsuga.org.',
    },
    {
      flag: "--platform-url",
      value: "<url>",
      summary:
        "Platform URL for one-click connect. Defaults to https://devdogsuga.org.",
    },
    {
      flag: "--device",
      summary:
        "Force the device-code flow instead of the local loopback listener.",
    },
    {
      flag: "--loopback",
      summary:
        "Force the local loopback listener even over SSH/Codespaces/a dev container.",
    },
  ],
};

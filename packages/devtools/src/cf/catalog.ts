/**
 * `cf`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import {
  YES,
  type CommandNode,
  type OptionChoice,
} from "@devdogsuga/cli-core/catalog";
import { workerApps } from "@devdogsuga/cli-core/workers";

/**
 * The `--app <slug>` choices shared by `cf preview`/`typegen`/`build`.
 *
 * `workerApps()` reads `workers.json` via `findRepoRoot()`, which throws
 * outside a DevDogsUGA checkout — and this module (via `help.ts`/`menu.ts`)
 * is imported for `devtools --help`, which must work from anywhere,
 * `/tmp` included (see `workers.ts`'s header). The tree below is built once
 * at import time regardless, so this falls back to an empty choice list
 * rather than propagating the throw: `--help` still renders the command
 * shape with no `--app` values listed, and any actual `cf preview --app …`
 * invocation outside a repo fails with the same clear `RepoNotFoundError`
 * it always would have, just a little further downstream.
 */
const WORKER_APP_CHOICES: OptionChoice[] = (() => {
  try {
    return workerApps().map((app) => ({ value: app, label: app }));
  } catch {
    return [];
  }
})();

export const cfCommand: CommandNode = {
  name: "cf",
  summary: "Develop and build an app on the Workers runtime.",
  hint: "preview, typegen — deploys live in CI",
  subcommands: [
    {
      name: "preview",
      summary: "Build and serve an app on the Workers runtime.",
      options: [
        {
          flag: "--app",
          value: "<slug>",
          summary: "App to preview. Asked for when absent.",
          prompt: {
            kind: "select",
            message: "Which app?",
            choices: WORKER_APP_CHOICES,
          },
        },
        {
          flag: "--tier",
          value: "<t>",
          summary: "Preview against a tier's env. Defaults to development.",
          // No prompt: the runtime resolver (`tier.ts`) asks this
          // itself, conditionally, for both the wizard and a direct
          // CLI invocation — a `prompt` here would ask it twice, once
          // on this screen and once when the command actually runs.
        },
        YES,
      ],
    },
    {
      name: "typegen",
      summary: "Regenerate cloudflare-env.d.ts from the wrangler config.",
      options: [
        {
          flag: "--app",
          value: "<slug>",
          summary: "App to run typegen for. Asked for when absent.",
          prompt: {
            kind: "select",
            message: "Which app?",
            choices: WORKER_APP_CHOICES,
          },
        },
        {
          flag: "--check",
          summary: "Check types only — do not write.",
          prompt: {
            kind: "confirm",
            message: "Check only (do not write)?",
            initial: true,
          },
        },
      ],
    },
    {
      name: "build",
      summary: "Build an app's Worker bundle for a tier.",
      options: [
        {
          flag: "--app",
          value: "<slug>",
          summary: "App to build. Asked for when absent.",
          prompt: {
            kind: "select",
            message: "Which app?",
            choices: WORKER_APP_CHOICES,
          },
        },
        {
          flag: "--tier",
          value: "<t>",
          summary: "Which deployment tier to build for.",
          prompt: {
            kind: "select",
            message: "Which tier?",
            choices: [
              { value: "staging" },
              { value: "production", hint: "⚠️  live bundle" },
            ],
          },
        },
      ],
    },
    {
      name: "exec",
      summary: "Run wrangler. Everything after -- passes through.",
      hint: "the escape hatch",
    },
  ],
};

/**
 * `moderation`' place in the command tree: declaration only, nothing here
 * runs. The handlers live in `commands.ts` beside it.
 *
 * It exists for the receiving half of Report & Block. An app that lets members
 * report content gets decisions back as signed messages from the platform; this
 * sends it the same messages from a terminal, to a receiver running in local
 * Docker, with no platform in the loop. `send` is one message, `samples` is the
 * conformance sequence (applied, duplicate, stale, ...).
 *
 * Both are `envFree` and `noEnv`: nothing here reads an env file, a database or a
 * tier, so they also run from `pnpm dlx` outside a checkout (entering the
 * development tier would look for the monorepo root above the package and
 * fail there). The target is a URL and the secret is a flag or the shell's
 * `PLATFORM_MODERATION_SECRET`.
 */
import {
  type CommandNode,
  type CommandOption,
} from "@devdogsuga/cli-core/catalog";

const TO: CommandOption = {
  flag: "--to",
  value: "<url>",
  summary:
    "The receiver's URL. Defaults to the local Edge Function, http://127.0.0.1:54321/functions/v1/platform-moderation.",
};

const SECRET: CommandOption = {
  flag: "--secret",
  value: "<whsec_...>",
  summary:
    "The signing secret the receiver verifies with. Defaults to $PLATFORM_MODERATION_SECRET, then the well-known sample secret.",
};

export const moderationCommand: CommandNode = {
  name: "moderation",
  title: "Test a Report & Block receiver",
  summary: "Send signed moderation messages to your app's receiver.",
  hint: "send one action, or run the conformance samples",
  subcommands: [
    {
      name: "send",
      title: "Send one signed action",
      summary: "Send one signed moderation action to a receiver.",
      hint: "like a moderator's decision, without the platform",
      envFree: true,
      noEnv: true,
      options: [
        TO,
        SECRET,
        {
          flag: "--content-type",
          value: "<type>",
          summary: "For content.* actions. Defaults to session.",
        },
        {
          flag: "--content-ref",
          value: "<id>",
          summary:
            "For content.* actions: your row's id. Defaults to a sample id.",
        },
        {
          flag: "--user",
          value: "<uuid>",
          summary:
            "For user.* actions: the platform user id. Defaults to a sample id.",
        },
        {
          flag: "--replay",
          summary: "Send the same message twice. The second must be ignored.",
        },
        {
          flag: "--stale",
          summary:
            "Date the decision a minute in the past, as a late retry would. A receiver that has seen a newer decision must ignore it.",
        },
      ],
    },
    {
      name: "samples",
      title: "Run the conformance samples",
      summary: "Send the conformance sequence and check each answer.",
      hint: "pass or fail",
      envFree: true,
      noEnv: true,
      options: [TO, SECRET],
    },
  ],
};

/**
 * `deploy`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import { DRY_RUN, TIER, type CommandNode } from "@devdogsuga/cli-core/catalog";

export const deployCommand: CommandNode = {
  name: "deploy",
  dryRun: "handled",
  summary: "Deploy an app: token gate, per-app steps, upload.",
  options: [TIER, DRY_RUN],
  subcommands: [
    // ── App orchestrators ────────────────────────────────────────────
    {
      name: "platform",
      summary: "Deploy the platform app.",
      options: [TIER, DRY_RUN],
    },
    {
      name: "schedule-builder",
      summary: "Deploy the schedule-builder app.",
      options: [TIER, DRY_RUN],
    },
    {
      name: "sandbox",
      summary: "Deploy the sandbox app.",
      options: [TIER, DRY_RUN],
    },
    // ── Step commands ────────────────────────────────────────────────
    {
      name: "write-env",
      summary: "Compose .env.<DEPLOY_ENV> from the GitHub environment.",
      options: [
        {
          flag: "--source",
          value: "<manifest>",
          summary: "Compose one manifest's slice instead of all.",
        },
        DRY_RUN,
      ],
    },
    {
      name: "secrets-file",
      summary: "Write the --secrets-file wrangler uploads with a Worker.",
      options: [
        {
          flag: "--app",
          value: "<app>",
          summary: "Whose manifest declares the Worker's secrets.",
        },
        DRY_RUN,
      ],
    },
    {
      name: "orphans",
      summary: "Report Worker secrets nothing declares.",
      options: [
        {
          flag: "--prune",
          summary: "Delete them. production-apply only.",
        },
        DRY_RUN,
      ],
    },
    {
      name: "preflight",
      summary: "Classify the project: paused (skip) vs broken (fail).",
    },
    {
      name: "require-token",
      summary: "Refuse to deploy without CLOUDFLARE_API_TOKEN.",
    },
    {
      name: "require-planner",
      summary: "Refuse to plan unless DB_URL is the planner role.",
    },
    {
      name: "plan",
      summary: "Dry-run the migrations into the job summary.",
      options: [
        {
          flag: "--label",
          value: "<title>",
          summary: "Heading for the summary section.",
        },
      ],
    },
    {
      name: "migrate",
      summary: "Apply the migrations to DB_URL.",
      options: [DRY_RUN],
    },
  ],
};

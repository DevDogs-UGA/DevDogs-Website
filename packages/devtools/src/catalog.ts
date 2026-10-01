/**
 * devtools' command tree, composed from each domain's `catalog.ts`.
 *
 * Every domain declares its own commands next to the handlers that run them
 * (`<domain>/catalog.ts`, inert data); this file is the one place that decides
 * how the root help and the wizard group them. Paths do not change when a
 * command moves between groups. Importing it runs nothing, so the launcher can
 * read it before the session's environment is entered.
 */
import { createCatalog, type CommandGroup } from "@devdogsuga/cli-core/catalog";
import { bwCommand } from "./bws/catalog.js";
import { cfCommand } from "./cf/catalog.js";
import { completionsCommand } from "./completions/catalog.js";
import { checkCommand } from "./check/catalog.js";
import { cronCommand } from "./cron/catalog.js";
import { deployCommand } from "./deploy/catalog.js";
import { dbCommand } from "./db/catalog.js";
import { doctorCommand } from "./doctor/catalog.js";
import { emailsCommand } from "./emails/catalog.js";
import { envCommand } from "./env/catalog.js";
import { genCommand } from "./gen/catalog.js";
import { githubCommand } from "./gh/catalog.js";
import { grantRootCommand, rolesCommand } from "./roles/catalog.js";
import { imagesCommand } from "./images/catalog.js";
import { oauthCommand } from "./oauth/catalog.js";
import {
  drizzleKitCommand,
  psqlCommand,
  supabaseCommand,
  wranglerCommand,
} from "./passthrough/catalog.js";
import { plannerCommand } from "./planner/catalog.js";
import { presetCommand } from "./preset/catalog.js";
import { runCommand } from "./run/catalog.js";
import { scriptCommand } from "./script/catalog.js";
import { setupCommand } from "./setup/catalog.js";
import { workflowsCommand } from "./workflows/catalog.js";

/** The contributor-facing navigation, grouped by the job somebody is doing. */
export const GROUPS: readonly CommandGroup[] = [
  {
    title: "Workspace",
    commands: [
      setupCommand,
      oauthCommand,
      scriptCommand,
      runCommand,
      genCommand,
    ],
  },
  {
    title: "Runtime & infrastructure",
    commands: [
      dbCommand,
      cfCommand,
      presetCommand,
      cronCommand,
      workflowsCommand,
    ],
  },
  {
    title: "The real tools",
    commands: [
      supabaseCommand,
      wranglerCommand,
      drizzleKitCommand,
      psqlCommand,
    ],
  },
  {
    title: "Content & communications",
    commands: [imagesCommand, emailsCommand],
  },
  {
    title: "Configuration & integrations",
    commands: [envCommand, rolesCommand, grantRootCommand],
  },
  {
    // Always need production secrets, so they leave for the backstage CLI
    // (TASK-399); grouped here so that move is one cut.
    title: "Production (moving to backstage)",
    commands: [bwCommand, plannerCommand],
  },
  {
    title: "Environment",
    commands: [doctorCommand],
  },
  {
    title: "GitHub",
    commands: [githubCommand],
  },
  {
    title: "CI & CLI utilities",
    commands: [checkCommand, completionsCommand],
  },
];

/**
 * The commands the `devtools-ci` bin exposes. Never reached from the wizard
 * and never rendered in `--help`.
 */
export const CI_GROUPS: readonly CommandGroup[] = [
  { title: "Deploy", commands: [deployCommand] },
];

export const catalog = createCatalog({
  usage: "pnpm devtools",
  commonTasks: [
    ["setup", "Prepare a new checkout"],
    ["run dev", "Start development servers"],
    ["supabase start", "Start Supabase on this machine"],
    ["supabase <args>", "Run the Supabase CLI against this session's tier"],
    ["preset apply-migrations", "Push migrations, then offer types:db"],
    ["cron run", "Choose and run a scheduled job"],
  ],
  groups: GROUPS,
  ciGroups: CI_GROUPS,
});

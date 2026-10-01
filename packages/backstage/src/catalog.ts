/**
 * backstage's command tree, composed from each domain's `catalog.ts`.
 *
 * Every domain declares its own commands next to the handlers that run them
 * (`<domain>/catalog.ts`, inert data); this file is the one place that decides
 * how the root help and the menu group them. Importing it runs nothing, so the
 * launcher can read it before the session's environment is entered.
 *
 * Everything here is grouped by what it needs, not by what it does: the first
 * three groups always need production secrets, the rest need nothing the
 * caller has not got.
 */
import { createCatalog, type CommandGroup } from "@devdogsuga/cli-core/catalog";
import { completionsCommand } from "./completions/catalog.js";
import { deployCommand } from "./deploy/catalog.js";
import { envCommand } from "./env/catalog.js";
import { plannerCommand } from "./planner/catalog.js";

export const GROUPS: readonly CommandGroup[] = [
  {
    title: "Production deploys",
    commands: [deployCommand],
  },
  {
    title: "Secrets & environments",
    commands: [envCommand],
  },
  {
    title: "Database roles",
    commands: [plannerCommand],
  },
  {
    title: "CLI utilities",
    commands: [completionsCommand],
  },
];

export const catalog = createCatalog({
  usage: "pnpm backstage",
  commonTasks: [
    ["env pull --target production", "Fill .env.production from the vault"],
    ["env audit --target production", "Compare every store, list orphans"],
    ["deploy platform --tier staging", "Deploy an app"],
    ["planner status", "Check the preflight credential"],
  ],
  groups: GROUPS,
});

/**
 * backstage's command tree, composed from each domain's `catalog.ts`.
 *
 * Every domain declares its own commands next to the handlers that run them
 * (`<domain>/catalog.ts`, inert data); this file is the one place that decides
 * how the root help and the menu group them. Importing it runs nothing, so the
 * launcher can read it before the session's environment is entered.
 *
 * Everything here is grouped by what it needs, not by what it does: the first
 * three groups always need production secrets, then come the tools that need
 * nothing, the caller's own GitHub login, and the club mailbox sign-in.
 */
import { createCatalog, type CommandGroup } from "@devdogsuga/cli-core/catalog";
import { completionsCommand } from "./completions/catalog.js";
import { credsCommand } from "./creds/catalog.js";
import { deployCommand } from "./deploy/catalog.js";
import { envCommand } from "./env/catalog.js";
import { githubCommand } from "./github/catalog.js";
import { involvementCommand } from "./involvement/catalog.js";
import { graphicsCommand } from "./graphics/catalog.js";
import { newsletterCommand } from "./newsletter/catalog.js";
import { plannerCommand } from "./planner/catalog.js";
import { qrCommand } from "./qr/catalog.js";

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
    title: "Production database",
    commands: [plannerCommand, involvementCommand],
  },
  {
    title: "Graphics & QR codes (no credentials)",
    commands: [graphicsCommand, qrCommand],
  },
  {
    title: "Your own sign-in (gh login, club mailbox, Bitwarden)",
    commands: [githubCommand, newsletterCommand, credsCommand],
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
    ["graphics 'event/*' --out ~/images", "Render event images"],
    ["qr https://devdogsuga.org --format svg,png", "Make a QR code"],
  ],
  groups: GROUPS,
});

/**
 * `import involvement`'s place in the command tree: declaration only,
 * nothing here runs. The handler lives in `commands.ts` beside it.
 *
 * `envFree` like `creds`: it reads production's keys itself, from the
 * checkout's `.env.production` or Secrets Manager, so no env file or tier is
 * entered and it runs under `pnpm dlx`. There is no `--db-url`: the import
 * also creates accounts through Auth, and a database override that left Auth
 * pointed at production would split one import across two projects.
 */
import { DRY_RUN, YES, type CommandNode } from "@devdogsuga/cli-core/catalog";

export const involvementImport: CommandNode = {
  name: "involvement",
  envFree: true,
  dryRun: "handled",
  summary:
    "Import an Organization Roster export: verify everyone on it, unverify everyone else.",
  hint: "previews, then asks",
  options: [
    {
      flag: "--file",
      value: "<csv>",
      summary:
        "The roster export (Involvement Network → Roster → Export → Organization Roster).",
    },
    DRY_RUN,
    YES,
  ],
};

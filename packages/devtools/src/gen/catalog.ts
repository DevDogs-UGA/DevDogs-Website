/**
 * `gen`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import { type CommandNode } from "@devdogsuga/cli-core/catalog";

export const genCommand: CommandNode = {
  name: "gen",
  summary: "Regenerate committed, generated source.",
  hint: "refresh a tracked artifact",
  subcommands: [
    {
      name: "campus-map",
      summary: "Rebuild the FindUs campus map from OpenStreetMap.",
      hint: "occasional — rerun when OSM improves the area",
    },
  ],
};

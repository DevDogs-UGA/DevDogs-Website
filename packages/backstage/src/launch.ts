/**
 * `backstage`'s entry point, run by the `bin/backstage.mjs` bootstrap. All of
 * the launching is in `launch-core.ts`; this file only says which dispatcher
 * runs the command.
 */
import { launchWith } from "./launch-core.js";

export async function launch(argv: readonly string[]): Promise<void> {
  await launchWith(argv, {
    dispatch: async (args) => {
      const { main } = await import("./cli.js");
      await main(args);
    },
  });
}

// A direct `tsx src/launch.ts <argv…>` run.
if (import.meta.url === `file://${process.argv[1]}`) {
  await launch(process.argv.slice(2));
}

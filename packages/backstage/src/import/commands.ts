/**
 * `backstage import <involvement|attendance>`: routes to the domain that owns
 * each import. They load on use, like every other command group.
 */
import type { CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { explain } from "@devdogsuga/cli-core/ui";

export const handleImport: CommandHandler = async (rest) => {
  const [what, ...args] = rest;
  if (what === "involvement") {
    return (await import("../involvement/commands.js")).handleInvolvement(args);
  }
  if (what === "attendance") {
    return (await import("../attendance/commands.js")).handleAttendance(args);
  }
  explain(
    what
      ? `Unknown import "${what}". Try involvement or attendance.`
      : "Name the import: involvement or attendance.",
    "",
  );
  process.exitCode = 1;
  return null;
};

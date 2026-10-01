/**
 * `grant-root [--user <email>]`: give an account the Root role.
 */
import { confirm, log, select } from "@clack/prompts";
import { flagValue } from "@devdogsuga/cli-core/args";
import type { DbConnection } from "@devdogsuga/cli-core/db/connection";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { resolveInstance, type Instance } from "@devdogsuga/cli-core/instance";
import { bail, explain, explainError, unwrap } from "@devdogsuga/cli-core/ui";
import {
  currentRootHolder,
  grantRoot,
  listCandidates,
  transferRoot,
} from "./roles.js";

/**
 * Grants Root, asking who to if it was not told.
 *
 * Transferring is a separate confirmation from granting, because they are
 * different actions wearing the same name: one gives you a console you did not
 * have, the other takes somebody else's away. `userRoles_root_singleton` means
 * there is no state where both hold it, so the release cannot be skipped.
 *
 * Runs on any tier the session resolves to now — `resolveInstance` (see
 * `instance.ts`) replaced the local-only `supabase status` probe this used
 * to go through — so a PRODUCTION target gets the same `--yes`/stern-confirm
 * treatment `db reset` does: this is a privilege escalation on whatever
 * database it runs against, and on production that database is live.
 */
async function runGrantRoot(
  connection: DbConnection,
  instance: Instance,
  userEmail: string | undefined,
  rest: string[],
): Promise<void> {
  let holder: Awaited<ReturnType<typeof currentRootHolder>>;
  let candidates: Awaited<ReturnType<typeof listCandidates>>;

  try {
    [holder, candidates] = await Promise.all([
      currentRootHolder(instance),
      listCandidates(instance),
    ]);
  } catch (err) {
    explainError("Could not read the current roles.", err);
    process.exitCode = 1;
    return;
  }

  if (candidates.length === 0) {
    explain("There are no accounts on this database yet.", "", [
      "Sign in once through the app, then run this again.",
      ...(connection.tier === "development"
        ? ["Or create one: `pnpm devtools persona member`."]
        : []),
    ]);
    return;
  }

  const chosen =
    userEmail ??
    unwrap(
      await select({
        message: "Which account should hold Root?",
        options: candidates.map((c) => ({
          value: c.email,
          label: c.email,
          hint: c.userId === holder?.userId ? "holds it now" : undefined,
        })),
      }),
    );

  const target = candidates.find((c) => c.email === chosen);

  if (!target) {
    explain(`No account on this database has the address ${chosen}.`, "", [
      "Run without --user to pick from a list.",
    ]);
    process.exitCode = 1;
    return;
  }

  if (holder?.userId === target.userId) {
    log.info(`${target.email} already holds Root.`);
    return;
  }

  const action = holder
    ? `Take Root away from ${holder.email} and give it to ${target.email}`
    : `Give ${target.email} Root, which confers every permission`;

  if (connection.tier === "production") {
    // ⚠️ SAFETY: same gate `runStack` uses for `db reset`/`migrate` — see
    // that function's header for why `--yes` is checked before anything
    // TTY-dependent runs.
    if (!rest.includes("--yes")) {
      if (!process.stdin.isTTY) {
        process.stderr.write(
          "devtools grant-root: --yes is required to run non-interactively.\n",
        );
        process.exitCode = 1;
        return;
      }
      const confirmed = unwrap(
        await confirm({
          message: `${action} on the PRODUCTION database. Continue?`,
          initialValue: false,
        }),
      );
      if (!confirmed) bail("Left Root where it was.");
    }
  } else if (holder) {
    // Transferring away from someone still asks, even off production —
    // taking a console away from an existing holder is worth a question
    // granting to nobody-yet-holding is not.
    const confirmed = unwrap(
      await confirm({
        message: `Root is held by ${holder.email}. Take it away and give it to ${target.email}?`,
        initialValue: false,
      }),
    );
    if (!confirmed) bail("Left Root where it was.");
  }

  try {
    if (holder) {
      await transferRoot(instance, holder.userId, target.userId);
    } else {
      await grantRoot(instance, target.userId);
    }
    log.success(
      `${target.email} now holds Root, which confers every permission. ` +
        "Sign out and back in if the console was already open.",
    );
  } catch (err) {
    explainError("Could not grant Root.", err, [
      "Seeds create the Root role definition — try `pnpm devtools db reset` " +
        "(development) or `pnpm devtools db seed production` (staging/production) first.",
    ]);
    process.exitCode = 1;
  }
}

export const handleGrantRoot: CommandHandler = async (rest) => {
  const resolved = await resolveInstance({ label: "devtools grant-root" });
  if (!resolved) {
    process.exitCode = 1;
    return null;
  }
  await runGrantRoot(
    resolved.connection,
    resolved.instance,
    flagValue(rest, "--user"),
    rest,
  );
  return DONE;
};

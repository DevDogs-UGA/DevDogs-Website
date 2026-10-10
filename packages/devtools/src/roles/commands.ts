/**
 * `roles list|grant|revoke`.
 *
 * Runs on whatever tier the session resolves to. The launcher's hosted-tier
 * gate has already asked about staging and production before a handler runs,
 * so nothing here repeats that question. The one confirmation that belongs to
 * this command is President: only one account can hold it, so granting it
 * names the current holder and says it is being taken away.
 */
import { confirm, log, select } from "@clack/prompts";
import { positionals } from "@devdogsuga/cli-core/args";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { resolveInstance, type Instance } from "@devdogsuga/cli-core/instance";
import { hasYes, isNonInteractive } from "@devdogsuga/cli-core/mode";
import { bail, explain, explainError, unwrap } from "@devdogsuga/cli-core/ui";
import {
  findAccount,
  findRole,
  syncedWithDiscord,
  planGrant,
  planRevoke,
  unassignable,
  PRESIDENT_ROLE_ID,
  type Account,
  type RoleRow,
} from "./rules.js";
import {
  grantRole,
  listAccounts,
  listAssignments,
  listRoles,
  revokeRole,
  transferRole,
} from "./store.js";

interface Snapshot {
  roles: RoleRow[];
  accounts: Account[];
  assignments: Map<string, string[]>;
}

async function snapshot(instance: Instance): Promise<Snapshot> {
  const [roles, accounts, assignments] = await Promise.all([
    listRoles(instance),
    listAccounts(instance),
    listAssignments(instance),
  ]);
  return { roles, accounts, assignments };
}

function holdersOf(state: Snapshot, role: RoleRow): Account[] {
  const ids = new Set(state.assignments.get(role.id) ?? []);
  return state.accounts.filter((account) => ids.has(account.userId));
}

// ── list ─────────────────────────────────────────────────────────────────────

async function runList(instance: Instance, rest: string[]): Promise<void> {
  const state = await snapshot(instance);
  const rows = state.roles.map((role) => ({
    id: role.id,
    title: role.title,
    rank: role.rank,
    syncedWithDiscord: syncedWithDiscord(role),
    // Member is implicit: nothing is stored for it.
    everyone: role.roleType !== "custom",
    holders: holdersOf(state, role).map((holder) => holder.email),
  }));

  if (rest.includes("--json")) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }
  for (const row of rows) {
    const note = row.syncedWithDiscord ? " (synced with Discord)" : "";
    const who = row.everyone ? "everyone" : row.holders.join(", ") || "nobody";
    process.stdout.write(`${row.title}${note}: ${who}\n`);
  }
}

// ── grant and revoke ─────────────────────────────────────────────────────────

/**
 * Something is missing and nobody can be asked. Says what to type instead of
 * waiting on a prompt that never resolves.
 */
function cannotAsk(usage: string): boolean {
  if (!isNonInteractive()) return false;
  explain("Nothing to ask without a terminal.", "", [usage]);
  process.exitCode = 1;
  return true;
}

async function pickAccount(
  state: Snapshot,
  email: string | undefined,
  usage: string,
): Promise<Account | null> {
  if (email === undefined) {
    if (cannotAsk(usage)) return null;
    if (state.accounts.length === 0) {
      explain("There are no accounts on this database yet.", "", [
        "Sign in once through the app, then run this again.",
      ]);
      return null;
    }
    const chosen = unwrap(
      await select({
        message: "Which account?",
        options: state.accounts.map((a) => ({ value: a, label: a.email })),
      }),
    );
    return chosen;
  }
  const account = findAccount(state.accounts, email);
  if (!account) {
    explain(`No account on this database has the address ${email}.`, "", [
      "Run `roles list` or leave the address out to pick from a list.",
    ]);
    process.exitCode = 1;
    return null;
  }
  return account;
}

async function pickRole(
  state: Snapshot,
  name: string | undefined,
  usage: string,
  candidates: readonly RoleRow[],
): Promise<RoleRow | null> {
  if (name === undefined) {
    if (cannotAsk(usage)) return null;
    return unwrap(
      await select({
        message: "Which role?",
        // Disabled rather than hidden, so nobody wonders where it went.
        options: candidates.map((role) => {
          const reason = unassignable(role);
          return {
            value: role,
            label: role.title,
            hint: reason ?? undefined,
            disabled: reason !== null,
          };
        }),
      }),
    );
  }
  const role = findRole(state.roles, name);
  if (!role) {
    explain(`There is no role called ${name}.`, "", [
      "Run `roles list` for the names.",
    ]);
    process.exitCode = 1;
    return null;
  }
  return role;
}

async function confirmTransfer(
  from: Account,
  to: Account,
  yes: boolean,
): Promise<boolean> {
  const message = `President is held by ${from.email}. Take it away and give it to ${to.email}?`;
  if (yes) return true;
  if (isNonInteractive()) {
    process.stderr.write(`devtools roles: ${message} Pass --yes to confirm.\n`);
    process.exitCode = 1;
    return false;
  }
  return unwrap(await confirm({ message, initialValue: false }));
}

interface GrantRequest {
  email?: string;
  role?: string;
  yes: boolean;
}

async function runGrant(instance: Instance, rest: string[]): Promise<void> {
  const [, email, role] = positionals(rest);
  await grant(instance, { email, role, yes: hasYes(rest) });
}

async function grant(instance: Instance, request: GrantRequest): Promise<void> {
  const emailArg = request.email;
  const roleArg = request.role;
  const usage = "devtools roles grant <email> <role>";
  const state = await snapshot(instance);

  const account = await pickAccount(state, emailArg, usage);
  if (!account) return;
  const role = await pickRole(state, roleArg, usage, state.roles);
  if (!role) return;

  const plan = planGrant(role, account, holdersOf(state, role));
  switch (plan.kind) {
    case "refused":
      explain(plan.reason, "");
      process.exitCode = 1;
      return;
    case "already":
      log.info(`${account.email} already holds ${role.title}.`);
      return;
    case "transfer":
      if (!(await confirmTransfer(plan.from, account, request.yes))) {
        if (!process.exitCode) bail("Left President where it was.");
        return;
      }
      await transferRole(instance, role.id, plan.from.userId, account.userId);
      break;
    case "grant":
      await grantRole(instance, account.userId, role.id);
      break;
  }
  log.success(
    `${account.email} now holds ${role.title}. Sign out and back in if the console was already open.`,
  );
}

async function runRevoke(instance: Instance, rest: string[]): Promise<void> {
  const [, emailArg, roleArg] = positionals(rest);
  const usage = "devtools roles revoke <email> <role>";
  const state = await snapshot(instance);

  const account = await pickAccount(state, emailArg, usage);
  if (!account) return;
  const held = state.roles.filter((role) =>
    state.assignments.get(role.id)?.includes(account.userId),
  );
  const role = await pickRole(state, roleArg, usage, held);
  if (!role) return;

  const plan = planRevoke(role, account, holdersOf(state, role));
  if (plan.kind === "refused") {
    explain(plan.reason, "");
    process.exitCode = 1;
    return;
  }
  if (plan.kind === "not-held") {
    log.info(`${account.email} does not hold ${role.title}.`);
    return;
  }
  await revokeRole(instance, account.userId, role.id);
  log.success(
    role.id === PRESIDENT_ROLE_ID
      ? `${account.email} no longer holds President. Nobody does now: \`roles grant <email> President\` names the next one.`
      : `${account.email} no longer holds ${role.title}.`,
  );
}

// ── dispatch ─────────────────────────────────────────────────────────────────

async function withInstance(
  rest: string[],
  run: (instance: Instance, rest: string[]) => Promise<void>,
): Promise<void> {
  const resolved = await resolveInstance({ label: "devtools roles" });
  if (!resolved) {
    process.exitCode = 1;
    return;
  }
  try {
    await run(resolved.instance, rest);
  } catch (err) {
    explainError("Could not change roles.", err, [
      "Migrations create the built-in roles: `pnpm devtools supabase db reset` " +
        "(development) or `pnpm devtools apply-migrations` (staging/production).",
    ]);
    process.exitCode = 1;
  }
}

export const handleRoles: CommandHandler = async (rest) => {
  const sub = positionals(rest)[0];
  if (sub === "list") await withInstance(rest, runList);
  else if (sub === "grant") await withInstance(rest, runGrant);
  else if (sub === "revoke") await withInstance(rest, runRevoke);
  else {
    process.stderr.write(
      `devtools roles: unknown subcommand "${sub ?? "(none)"}". Expected: list, grant or revoke.\n`,
    );
    process.exitCode = 1;
  }
  return process.exitCode ? null : DONE;
};

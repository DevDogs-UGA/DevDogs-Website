/**
 * What may be granted or revoked, decided without touching a database.
 *
 * The console's guards live in the platform app
 * (`server/actions/permissionGuards.ts`), which this package cannot import, so
 * the two that apply to a caller with no rank are mirrored here. Keep them in
 * step:
 *
 *   * `requireCustomRole`: only a `custom` role with a rank is assignable.
 *     Member (`default`) is held by everyone and is never assigned.
 *   * `requireRankGuard` has nothing to compare. The CLI writes with the
 *     service key, so it acts above every rank, exactly like `grant-root` did.
 *
 * Discord-synced roles are refused for now: until the platform pushes a
 * platform-side grant to Discord (TASK-440), a grant made here would be undone
 * by the next `sync-discord-roles` run. `managedByDiscord` is the single place
 * to relax when that lands.
 */
import { PRESIDENT_ROLE_ID } from "@devdogsuga/cli-core/instance";

export { PRESIDENT_ROLE_ID };

export interface RoleRow {
  id: string;
  title: string;
  roleType: string;
  rank: number | null;
  discordRoleId: string | null;
}

export interface Account {
  userId: string;
  email: string;
}

/** The reason the role cannot be picked, or `null` when it can. */
export function unassignable(role: RoleRow): string | null {
  if (role.roleType !== "custom" || role.rank === null) {
    return "Not assignable";
  }
  if (managedByDiscord(role)) return "Managed by Discord";
  return null;
}

export function managedByDiscord(role: RoleRow): boolean {
  return role.discordRoleId !== null;
}

/** A role by id, or by title ignoring case. */
export function findRole(
  roles: readonly RoleRow[],
  query: string,
): RoleRow | undefined {
  const wanted = query.trim().toLowerCase();
  return roles.find(
    (role) => role.id === wanted || role.title.toLowerCase() === wanted,
  );
}

/** An account by email, ignoring case. */
export function findAccount(
  accounts: readonly Account[],
  email: string,
): Account | undefined {
  const wanted = email.trim().toLowerCase();
  return accounts.find((account) => account.email.toLowerCase() === wanted);
}

export type GrantPlan =
  | { kind: "refused"; reason: string }
  | { kind: "already" }
  | { kind: "grant" }
  /** President only: the unique index allows one holder, so the current one loses it first. */
  | { kind: "transfer"; from: Account };

/**
 * `holders` is everyone holding `role` now. Only President is singular, so
 * only President can transfer.
 */
export function planGrant(
  role: RoleRow,
  target: Account,
  holders: readonly Account[],
): GrantPlan {
  const reason = unassignable(role);
  if (reason) {
    return {
      kind: "refused",
      reason:
        reason === "Managed by Discord"
          ? `${role.title} is managed by Discord. Give it on Discord and the next sync copies it here.`
          : `${role.title} cannot be granted: it is not an assignable role.`,
    };
  }
  if (holders.some((holder) => holder.userId === target.userId)) {
    return { kind: "already" };
  }
  if (role.id === PRESIDENT_ROLE_ID) {
    const current = holders[0];
    if (current) return { kind: "transfer", from: current };
  }
  return { kind: "grant" };
}

export type RevokePlan =
  | { kind: "refused"; reason: string }
  | { kind: "not-held" }
  | { kind: "revoke" };

export function planRevoke(
  role: RoleRow,
  target: Account,
  holders: readonly Account[],
): RevokePlan {
  const reason = unassignable(role);
  if (reason) {
    return {
      kind: "refused",
      reason:
        reason === "Managed by Discord"
          ? `${role.title} is managed by Discord. Remove it on Discord and the next sync copies that here.`
          : `${role.title} cannot be revoked: it is not an assignable role.`,
    };
  }
  if (!holders.some((holder) => holder.userId === target.userId)) {
    return { kind: "not-held" };
  }
  return { kind: "revoke" };
}

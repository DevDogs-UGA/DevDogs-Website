/**
 * Reads and writes `platform."roles"` and `platform."userRoles"` with the
 * session tier's service key.
 *
 * What makes this safe is a credential, not a check: the service key proves
 * "you already control this database", the only true statement available. It
 * replaced `platform.claim_root()`, an RPC any authenticated caller could use
 * while nobody held the top role. By hand the equivalent is an INSERT in the
 * Supabase dashboard.
 *
 * `userRoles_root_singleton` is a unique index on the President id, so a
 * second President fails at the database. `planGrant` exists to fail earlier
 * with a sentence a contributor can act on.
 */
import { adminClient, type Instance } from "@devdogsuga/cli-core/instance";
import type { Account, RoleRow } from "./rules.js";

export async function listRoles(instance: Instance): Promise<RoleRow[]> {
  const { data, error } = await adminClient(instance)
    .from("roles")
    .select("id, title, roleType, rank, discordRoleId")
    .order("rank", { ascending: true, nullsFirst: false });
  if (error)
    throw new Error(`Could not read platform."roles": ${error.message}`);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    roleType: String(row.roleType),
    rank: row.rank === null ? null : Number(row.rank),
    discordRoleId:
      row.discordRoleId === null ? null : String(row.discordRoleId),
  }));
}

/** Every account, sorted by email. `listUsers` pages, so this walks the pages. */
export async function listAccounts(instance: Instance): Promise<Account[]> {
  const admin = adminClient(instance);
  const accounts: Account[] = [];
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not list accounts: ${error.message}`);
    for (const user of data.users) {
      accounts.push({ userId: user.id, email: user.email ?? "(no email)" });
    }
    if (data.users.length < perPage) break;
  }
  return accounts.sort((a, b) => a.email.localeCompare(b.email));
}

/** Which role ids each account holds, as role id -> user ids. */
export async function listAssignments(
  instance: Instance,
): Promise<Map<string, string[]>> {
  const { data, error } = await adminClient(instance)
    .from("userRoles")
    .select("userId, roleId");
  if (error)
    throw new Error(`Could not read platform."userRoles": ${error.message}`);
  const byRole = new Map<string, string[]>();
  for (const row of data ?? []) {
    const roleId = String(row.roleId);
    byRole.set(roleId, [...(byRole.get(roleId) ?? []), String(row.userId)]);
  }
  return byRole;
}

export async function grantRole(
  instance: Instance,
  userId: string,
  roleId: string,
): Promise<void> {
  const { error } = await adminClient(instance)
    .from("userRoles")
    .insert({ userId, roleId });
  if (error) throw new Error(`Could not grant the role: ${error.message}`);
}

export async function revokeRole(
  instance: Instance,
  userId: string,
  roleId: string,
): Promise<void> {
  const { error } = await adminClient(instance)
    .from("userRoles")
    .delete()
    .eq("roleId", roleId)
    .eq("userId", userId);
  if (error) throw new Error(`Could not revoke the role: ${error.message}`);
}

/** Hands a singular role over, which takes removing it first. */
export async function transferRole(
  instance: Instance,
  roleId: string,
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  await revokeRole(instance, fromUserId, roleId);
  await grantRole(instance, toUserId, roleId);
}

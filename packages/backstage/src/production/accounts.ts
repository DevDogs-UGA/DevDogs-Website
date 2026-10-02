/**
 * Production accounts: reading them, finding one by email, and creating the
 * ones a member list names but nobody has made yet.
 *
 * An email finds its account by the profile's `ugaEmail` first, then by the
 * sign-in address. Officers often sign in with a personal address and have
 * their MyID one recorded as `ugaEmail`; matching only the sign-in address
 * would give them a second, empty account.
 *
 * Accounts are created through the Auth admin API, confirmed and with no
 * invite email, so the member's first sign-in with that address lands on an
 * account that already has their history. Nothing makes a profile when an
 * account is created; each caller inserts its own, with what it knows.
 */
import { errorMessage } from "@devdogsuga/cli-core/ui";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ProductionError, withConnection, type Sql } from "./access.js";

/** One account, as {@link ACCOUNTS_QUERY} reads it. */
export interface AccountRow {
  userId: string;
  /** Lowercased sign-in address, when the account has one. */
  authEmail: string | null;
  /** Lowercased `profile.ugaEmail`. */
  ugaEmail: string | null;
  hasProfile: boolean;
  preferredName: string | null;
  involvementFirstName: string | null;
  involvementLastName: string | null;
}

export const ACCOUNTS_QUERY = `
select
  u."id" as "userId",
  lower(u."email") as "authEmail",
  lower(p."ugaEmail") as "ugaEmail",
  p."userId" is not null as "hasProfile",
  p."preferredName" as "preferredName",
  p."involvementFirstName" as "involvementFirstName",
  p."involvementLastName" as "involvementLastName"
from "auth"."users" u
left join "platform"."profile" p on p."userId" = u."id"
order by u."created_at"
`;

/** {@link ACCOUNTS_QUERY} on an open connection. */
export async function accountsWith(sql: Sql): Promise<AccountRow[]> {
  const rows = await sql.unsafe(ACCOUNTS_QUERY);
  return rows.map((row) => ({
    userId: String(row.userId),
    authEmail: (row.authEmail as string | null) ?? null,
    ugaEmail: (row.ugaEmail as string | null) ?? null,
    hasProfile: row.hasProfile === true,
    preferredName: (row.preferredName as string | null) ?? null,
    involvementFirstName: (row.involvementFirstName as string | null) ?? null,
    involvementLastName: (row.involvementLastName as string | null) ?? null,
  }));
}

export async function readAccounts(url: string): Promise<AccountRow[]> {
  return withConnection(
    url,
    "Could not read production's accounts",
    accountsWith,
  );
}

/** Finds an account by a lowercased email: `ugaEmail` first, then sign-in. */
export function accountFinder(
  accounts: readonly AccountRow[],
): (email: string) => AccountRow | undefined {
  const byUga = new Map<string, AccountRow[]>();
  const byAuth = new Map<string, AccountRow>();
  for (const a of accounts) {
    if (a.ugaEmail)
      byUga.set(a.ugaEmail, [...(byUga.get(a.ugaEmail) ?? []), a]);
    if (a.authEmail && !byAuth.has(a.authEmail)) byAuth.set(a.authEmail, a);
  }
  return (email) => {
    const viaUga = byUga.get(email);
    return (
      viaUga?.find((a) => a.authEmail === email) ??
      viaUga?.[0] ??
      byAuth.get(email)
    );
  };
}

/** Creates a confirmed account with no invite email. Returns its id. */
export type CreateAccount = (email: string) => Promise<string>;

export function createAccountFor(
  apiUrl: string,
  secretKey: string,
): CreateAccount {
  let client: Promise<SupabaseClient> | null = null;
  return async (email) => {
    client ??= import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(apiUrl, secretKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }),
    );
    const { data, error } = await (
      await client
    ).auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) {
      throw new ProductionError(error?.message ?? "no user returned");
    }
    return data.user.id;
  };
}

/** How many accounts are created at once. */
const CREATE_CONCURRENCY = 4;

/**
 * Creates an account for each email, a few at a time. A failure is recorded
 * and the rest carry on: one bad address must not cost everyone else.
 */
export async function createAccounts(
  emails: readonly string[],
  create: CreateAccount,
): Promise<{
  created: Map<string, string>;
  failed: { email: string; reason: string }[];
}> {
  const created = new Map<string, string>();
  const failed: { email: string; reason: string }[] = [];
  const queue = [...emails];
  const worker = async () => {
    for (let email = queue.shift(); email; email = queue.shift()) {
      try {
        created.set(email, await create(email));
      } catch (err) {
        failed.push({ email, reason: errorMessage(err) });
      }
    }
  };
  await Promise.all(Array.from({ length: CREATE_CONCURRENCY }, () => worker()));
  return { created, failed };
}

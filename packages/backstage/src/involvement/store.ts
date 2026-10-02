/**
 * Production reads and writes for `involvement import`.
 *
 * Three steps, in this order:
 *
 * 1. {@link readAccounts}: every account with its profile's involvement state,
 *    which `plan.ts` matches the roster against.
 * 2. {@link createAccount} for each roster email with no account, through the
 *    Auth admin API: confirmed, no invite email, so the member is already
 *    verified the first time they sign in with their MyID address. There is no
 *    trigger that makes a profile, so step 3 inserts one.
 * 3. {@link applyImport}: one transaction that upserts every roster member's
 *    profile, then clears involvement from everyone else.
 *
 * Accounts are created outside the transaction, because Auth is a separate
 * service. If step 3 then fails, those accounts exist without profiles; the
 * next run finds them by sign-in address and inserts the profiles, so a rerun
 * is the recovery.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { nonEmpty } from "@devdogsuga/cli-core/db/connection";
import { EnvDocument } from "@devdogsuga/cli-core/env/document";
import { discoverRepoRoot } from "@devdogsuga/cli-core/repo/root";
import type { SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";
import type { AccountRow } from "./plan.js";

export class InvolvementError extends Error {
  override name = "InvolvementError";
}

// ── Credentials ──────────────────────────────────────────────────────────────

/** The production project in Secrets Manager (see `creds/roster.ts`). */
const PRODUCTION_PROJECT = "production";

/** `.env.production` in a checkout, else the production Secrets Manager project. */
export async function readProductionKey(
  key: "DB_URL" | "API_URL" | "SECRET_KEY",
): Promise<string | undefined> {
  const root = discoverRepoRoot();
  if (root) {
    try {
      const text = await readFile(resolve(root, ".env.production"), "utf8");
      const value = nonEmpty(EnvDocument.parse(text).get(key));
      if (value) return value;
    } catch {
      // No .env.production here; Secrets Manager next.
    }
  }
  const { listSecrets, projectIdFor } = await import("../bws/client.js");
  const secrets = await listSecrets(await projectIdFor(PRODUCTION_PROJECT));
  return nonEmpty(secrets.find((s) => s.key === key)?.value);
}

export async function requireProductionKey(
  key: "DB_URL" | "API_URL" | "SECRET_KEY",
): Promise<string> {
  const value = await readProductionKey(key);
  if (!value) {
    throw new InvolvementError(
      `Could not find production's ${key}. Run \`backstage env pull --target production\` ` +
        "in a checkout, or sign in to Secrets Manager.",
    );
  }
  return value;
}

/**
 * A database failure, described without the connection string: postgres.js
 * can quote the host, and the URL carries the password.
 */
function dbError(what: string, err: unknown): InvolvementError {
  const e = err as { code?: string; message?: string };
  const detail = e.code && /^[0-9A-Z]{5}$/.test(e.code) ? e.message : e.code;
  return new InvolvementError(`${what}: ${detail ?? "connection failed"}.`);
}

function connect(url: string) {
  return postgres(url, { max: 1, prepare: false, connect_timeout: 15 });
}

// ── Reads ────────────────────────────────────────────────────────────────────

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

export async function readAccounts(url: string): Promise<AccountRow[]> {
  const sql = connect(url);
  try {
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
  } catch (err) {
    throw dbError("Could not read production's accounts", err);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** Creates a confirmed account with no invite email. Returns its id. */
export type CreateAccount = (email: string) => Promise<string>;

export function createAccountFor(apiUrl: string, secretKey: string) {
  let client: Promise<SupabaseClient> | null = null;
  const create: CreateAccount = async (email) => {
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
      throw new InvolvementError(error?.message ?? "no user returned");
    }
    return data.user.id;
  };
  return create;
}

/** One profile the import writes. */
export interface ProfileWrite {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
}

/**
 * Upserts every roster member's profile, then clears involvement from every
 * profile not among them, in one transaction.
 *
 * A new profile takes the roster's name as its preferred name; an existing
 * one keeps its own (see `plan.ts`). The durable identity columns (`ugaEmail`, `legal*`,
 * `identitySourcedAt`) are written for everyone on the roster and never
 * cleared, so missing one export does not erase who someone is.
 */
export const APPLY_UPSERT = `
insert into "platform"."profile" as p (
  "userId", "preferredName",
  "involvementFirstName", "involvementLastName", "involvementImportedAt",
  "ugaEmail", "legalFirstName", "legalLastName", "identitySourcedAt"
)
select t.u, t.f || ' ' || t.l, t.f, t.l, now(), t.e, t.f, t.l, now()
from unnest($1::uuid[], $2::text[], $3::text[], $4::text[]) as t(u, f, l, e)
on conflict ("userId") do update set
  "involvementFirstName" = excluded."involvementFirstName",
  "involvementLastName" = excluded."involvementLastName",
  "involvementImportedAt" = excluded."involvementImportedAt",
  "ugaEmail" = excluded."ugaEmail",
  "legalFirstName" = excluded."legalFirstName",
  "legalLastName" = excluded."legalLastName",
  "identitySourcedAt" = excluded."identitySourcedAt"
`;

export const APPLY_CLEAR = `
update "platform"."profile"
set "involvementFirstName" = null,
    "involvementLastName" = null,
    "involvementImportedAt" = null
where not ("userId" = any($1::uuid[]))
  and ("involvementFirstName" is not null or "involvementImportedAt" is not null)
`;

export type ApplyImport = (
  writes: readonly ProfileWrite[],
) => Promise<{ written: number; cleared: number }>;

export function applyImportFor(url: string): ApplyImport {
  return async (writes) => {
    const sql = connect(url);
    const ids = writes.map((w) => w.userId);
    try {
      return await sql.begin(async (tx) => {
        const upserted = await tx.unsafe(APPLY_UPSERT, [
          ids,
          writes.map((w) => w.firstName),
          writes.map((w) => w.lastName),
          writes.map((w) => w.email),
        ]);
        const cleared = await tx.unsafe(APPLY_CLEAR, [ids]);
        return { written: upserted.count, cleared: cleared.count };
      });
    } catch (err) {
      throw dbError("The import was rolled back", err);
    } finally {
      await sql.end({ timeout: 5 });
    }
  };
}

/**
 * The officer roster: who a shared login may be sent to.
 *
 * Read live from production every run, never cached and never committed: the
 * club's roles change at elections and mid-semester handoffs, and a stale list
 * is how a Send ends up with somebody who has left. An officer is anyone
 * holding a role other than the default `Member` one, addressed by their UGA
 * MyID email, the address Bitwarden verifies before it opens a Send.
 *
 * Picking is by person or by role, and choosing a role chooses everyone in
 * it. An email that is not on the roster is refused unless `--allow-email` is
 * passed, which is for the rare account shared outside the officer team.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EnvDocument } from "@devdogsuga/cli-core/env/document";
import { nonEmpty } from "@devdogsuga/cli-core/db/connection";
import { discoverRepoRoot } from "@devdogsuga/cli-core/repo/root";
import postgres from "postgres";
import { CredsError, registerSecret } from "./secrets.js";

export interface Officer {
  name: string;
  /** Lowercased UGA MyID address. */
  email: string;
  /** Role titles, highest rank first. */
  roles: string[];
}

export interface RosterRole {
  title: string;
  /** Lowercased, in roster order. */
  emails: string[];
}

export interface Roster {
  officers: Officer[];
  /** Highest rank first: President before the teams. */
  roles: RosterRole[];
}

/** One row of {@link ROSTER_QUERY}. */
export interface RosterRow {
  userId: string;
  name: string | null;
  ugaEmail: string | null;
  authEmail: string | null;
  roles: string[];
  /** Ranks, parallel to `roles`. */
  ranks: (number | null)[];
}

/**
 * Everyone holding a non-default role, one row per person.
 *
 * The UGA address comes from the profile first: an officer may sign in with a
 * personal address, and the seeds record the MyID one as `ugaEmail`. The
 * sign-in address is the fallback, used only when it is itself a UGA one.
 */
export const ROSTER_QUERY = `
select
  ur."userId" as "userId",
  coalesce(
    nullif(p."preferredName", ''),
    nullif(concat_ws(' ', p."legalFirstName", p."legalLastName"), '')
  ) as "name",
  p."ugaEmail" as "ugaEmail",
  u."email" as "authEmail",
  array_agg(r."title" order by r."rank" nulls last, r."title") as "roles",
  array_agg(r."rank" order by r."rank" nulls last, r."title") as "ranks"
from "platform"."userRoles" ur
join "platform"."roles" r on r."id" = ur."roleId"
join "auth"."users" u on u."id" = ur."userId"
left join "platform"."profile" p on p."userId" = ur."userId"
where r."roleType" <> 'default'
group by ur."userId", p."preferredName", p."legalFirstName", p."legalLastName", p."ugaEmail", u."email"
`;

/** Runs {@link ROSTER_QUERY}; injectable so tests never touch a database. */
export type RosterQuery = () => Promise<RosterRow[]>;

function isUgaEmail(email: string): boolean {
  return /@uga\.edu$/i.test(email);
}

/**
 * Builds the roster from query rows. People with no UGA address cannot be
 * sent to (Bitwarden would verify the wrong inbox), so they are set aside
 * and named in `skipped` for the caller to mention.
 */
export function rosterFromRows(rows: readonly RosterRow[]): {
  roster: Roster;
  skipped: string[];
} {
  const officers: Officer[] = [];
  const skipped: string[] = [];
  const rank = new Map<string, number>();

  for (const row of rows) {
    const email = [row.ugaEmail, row.authEmail]
      .map((e) => e?.trim().toLowerCase())
      .find((e): e is string => !!e && isUgaEmail(e));
    const name =
      [row.name?.trim(), row.authEmail].find((v) => !!v) ?? row.userId;
    if (!email) {
      skipped.push(name);
      continue;
    }
    officers.push({ name, email, roles: [...row.roles] });
    row.roles.forEach((title, i) => {
      const r = row.ranks[i] ?? Number.MAX_SAFE_INTEGER;
      rank.set(title, Math.min(rank.get(title) ?? r, r));
    });
  }

  officers.sort((a, b) => a.name.localeCompare(b.name));
  const titles = [...rank.keys()].sort(
    (a, b) => rank.get(a)! - rank.get(b)! || a.localeCompare(b),
  );
  const roles = titles.map((title) => ({
    title,
    emails: officers.filter((o) => o.roles.includes(title)).map((o) => o.email),
  }));
  return { roster: { officers, roles }, skipped };
}

export async function loadRoster(
  query: RosterQuery,
): Promise<{ roster: Roster; skipped: string[] }> {
  return rosterFromRows(await query());
}

/**
 * The role a typed name means: an exact title, else the one title it is a
 * prefix of, case-insensitively (`devops` is `DevOps Director`). Ambiguous or
 * unknown names throw, listing what there is.
 */
export function findRole(roster: Roster, typed: string): RosterRole {
  const needle = typed.trim().toLowerCase();
  const exact = roster.roles.find((r) => r.title.toLowerCase() === needle);
  if (exact) return exact;
  const prefixed = roster.roles.filter((r) =>
    r.title.toLowerCase().startsWith(needle),
  );
  if (prefixed.length === 1) return prefixed[0]!;
  const titles = roster.roles.map((r) => r.title).join(", ");
  throw new CredsError(
    prefixed.length === 0
      ? `No officer role called "${typed}". Roles: ${titles}.`
      : `"${typed}" could be ${prefixed.map((r) => r.title).join(" or ")}.`,
  );
}

/** Everyone in the named roles, once each, in roster order. */
export function emailsForRoles(
  roster: Roster,
  typed: readonly string[],
): string[] {
  const wanted = new Set(typed.flatMap((t) => findRole(roster, t).emails));
  return roster.officers.map((o) => o.email).filter((e) => wanted.has(e));
}

/**
 * Splits `emails` into the ones on the roster and the ones that are not.
 * With `allowEmail`, nothing is refused; addresses are lowercased either way,
 * because Bitwarden compares them and a capital letter is a different person
 * to a string comparison.
 */
export function checkRecipients(
  emails: readonly string[],
  roster: Roster,
  allowEmail: boolean,
): { accepted: string[]; refused: string[] } {
  const known = new Set(roster.officers.map((o) => o.email));
  const accepted: string[] = [];
  const refused: string[] = [];
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email || accepted.includes(email)) continue;
    if (allowEmail || known.has(email)) accepted.push(email);
    else refused.push(email);
  }
  return { accepted, refused };
}

/** "Name <email>" for an address on the roster, the bare address otherwise. */
export function describeRecipient(roster: Roster | undefined, email: string) {
  const officer = roster?.officers.find((o) => o.email === email);
  return officer ? `${officer.name} <${email}>` : email;
}

// ── Production ───────────────────────────────────────────────────────────────

/**
 * The production project in Secrets Manager. The same name the target table in
 * `@devdogsuga/env` gives it, spelled out here because `creds` runs with no
 * checkout, where that package is not installed.
 */
const PRODUCTION_PROJECT = "production";

export interface DbUrlSources {
  explicit?: string;
  /** `.env.production`'s `DB_URL`, when run inside a checkout. */
  fromCheckout?: () => Promise<string | undefined>;
  /** The production project's `DB_URL` in Secrets Manager. */
  fromSecretsManager?: () => Promise<string | undefined>;
}

/** `--db-url`, else the checkout's `.env.production`, else Secrets Manager. */
export async function resolveRosterDbUrl(
  sources: DbUrlSources = {},
): Promise<string> {
  const url =
    nonEmpty(sources.explicit) ??
    (await (sources.fromCheckout ?? readCheckoutDbUrl)()) ??
    (await (sources.fromSecretsManager ?? readSecretsManagerDbUrl)());
  registerSecret(url);
  if (!url) {
    throw new CredsError(
      "Could not find the production DB_URL to read the officer roster. " +
        "Pass --db-url, or run `backstage env pull --target production` in a checkout.",
    );
  }
  return url;
}

async function readCheckoutDbUrl(): Promise<string | undefined> {
  const root = discoverRepoRoot();
  if (!root) return undefined;
  try {
    const text = await readFile(resolve(root, ".env.production"), "utf8");
    return nonEmpty(EnvDocument.parse(text).get("DB_URL"));
  } catch {
    return undefined;
  }
}

async function readSecretsManagerDbUrl(): Promise<string | undefined> {
  const { listSecrets, projectIdFor } = await import("../bws/client.js");
  const secrets = await listSecrets(await projectIdFor(PRODUCTION_PROJECT));
  return nonEmpty(secrets.find((s) => s.key === "DB_URL")?.value);
}

/** {@link ROSTER_QUERY} against `url`, on one short-lived connection. */
export function rosterQueryFor(url: string): RosterQuery {
  return async () => {
    const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 15 });
    try {
      const rows = await sql.unsafe(ROSTER_QUERY);
      return rows.map((row) => ({
        userId: String(row.userId),
        name: (row.name as string | null) ?? null,
        ugaEmail: (row.ugaEmail as string | null) ?? null,
        authEmail: (row.authEmail as string | null) ?? null,
        roles: row.roles as string[],
        ranks: row.ranks as (number | null)[],
      }));
    } catch (err) {
      // postgres.js puts the connection string's host in some messages and
      // never the password, but the URL is a credential: say what failed, not
      // what it was given.
      throw new CredsError(
        `Could not read the officer roster from production: ${
          (err as { code?: string }).code ?? "connection failed"
        }.`,
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  };
}

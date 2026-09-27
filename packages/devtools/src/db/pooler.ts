/**
 * Validates a hosted `DB_URL` against the one shape it must have: the
 * Session pooler string, not the direct connection and not the Transaction
 * pooler.
 *
 * Pure and synchronous on purpose — `setup.ts`'s hosted wizard calls this
 * before writing anything to `.env`, and `doctor.ts`'s environment checker
 * calls the same function against whatever is already there, so the two
 * never drift into disagreeing about what a good `DB_URL` looks like.
 *
 * See the writing guide's collapsed note on poolers (docs/_shared or
 * toolkit/guides) for the wording this explains to a contributor; this
 * module only classifies, it does not print.
 */

export type DbUrlProblem =
  | "invalid"
  | "direct-connection"
  | "transaction-pooler";

export interface DbUrlValidation {
  ok: boolean;
  problem?: DbUrlProblem;
  /** The FAQ anchor id for this problem, for a caller that wants to link. */
  faqId?: "db-url-direct-connection" | "db-url-transaction-pooler";
  message?: string;
}

/** `db.<ref>.supabase.co` — the direct connection host, IPv6-only on the
 * free tier. */
const DIRECT_CONNECTION_HOST = /^db\.[a-z0-9]+\.supabase\.co$/i;

/** The Transaction pooler's port. Session pooler is 5432, same as plain
 * Postgres. */
const TRANSACTION_POOLER_PORT = "6543";

export function validateSessionPoolerUrl(dbUrl: string): DbUrlValidation {
  let url: URL;
  try {
    url = new URL(dbUrl);
  } catch {
    return {
      ok: false,
      problem: "invalid",
      message: "That does not look like a connection string (expected postgresql://...).",
    };
  }

  if (DIRECT_CONNECTION_HOST.test(url.hostname)) {
    return {
      ok: false,
      problem: "direct-connection",
      faqId: "db-url-direct-connection",
      message:
        `${url.hostname} is the direct connection host. It only answers on ` +
        "IPv6, and most campus/home networks are IPv4. Copy the Session " +
        "pooler string instead — Database settings → Connection string → " +
        "Session pooler.",
    };
  }

  if (url.port === TRANSACTION_POOLER_PORT) {
    return {
      ok: false,
      problem: "transaction-pooler",
      faqId: "db-url-transaction-pooler",
      message:
        "Port 6543 is the Transaction pooler, meant for serverless — it " +
        "breaks prepared statements (drizzle-kit hangs). Use the Session " +
        "pooler on port 5432 instead.",
    };
  }

  return { ok: true };
}

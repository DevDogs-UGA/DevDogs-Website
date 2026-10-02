/**
 * The write half of `import involvement`, after `plan.ts` has matched the
 * roster against production's accounts (`production/accounts.ts`) and any
 * missing accounts have been created.
 *
 * Accounts are created before this transaction, because Auth is a separate
 * service. If the transaction then fails, those accounts exist without
 * profiles; the next run finds them by sign-in address and inserts the
 * profiles, so a rerun is the recovery.
 */
import { withConnection } from "../production/access.js";

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
  return (writes) => {
    const ids = writes.map((w) => w.userId);
    return withConnection(url, "The import was rolled back", (sql) =>
      sql.begin(async (tx) => {
        const upserted = await tx.unsafe(APPLY_UPSERT, [
          ids,
          writes.map((w) => w.firstName),
          writes.map((w) => w.lastName),
          writes.map((w) => w.email),
        ]);
        const cleared = await tx.unsafe(APPLY_CLEAR, [ids]);
        return { written: upserted.count, cleared: cleared.count };
      }),
    );
  };
}

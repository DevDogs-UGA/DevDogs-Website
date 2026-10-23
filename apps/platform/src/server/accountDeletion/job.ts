import { asc, eq, lte, sql } from "drizzle-orm";
import { stripSyncedRolesFromGuild } from "~/server/discord/memberSync";
import { db } from "~/server/db";
import { accountDeletions, auditEvents } from "~/server/db/schema";
import { sendTemplate } from "~/server/email/send";
import { revalidateOfficers } from "~/server/loaders/officers";
import { queueDeliveriesQuietly } from "~/server/moderation/queue";
import { removeMemberOAuthApps } from "~/server/oauth/ownedClients";
import { supabaseAdmin } from "~/supabase/admin";
import { usersInAuth } from "~/supabase/drizzle/schema";
import { accountDeletionAuditEvent } from "./audit";
import {
  greetingName,
  isSolePresident,
  SOLE_PRESIDENT_ERROR,
} from "./schedule";

/** How many due deletions one run takes on; the next run takes the rest. */
const BATCH = 20;

type Deletion = typeof accountDeletions.$inferSelect;

export type DeletionRun = {
  completed: string[];
  /** Left pending, to be retried by the next run. */
  failed: { userId: string; error: string }[];
};

/**
 * Does every deletion whose window has ended (account-deletion Q4).
 *
 * Each runs on its own: one member's failure is recorded on their row and
 * reported, and the rest of the batch carries on. A failed deletion simply
 * stays pending, so the next run starts it again from the top; every step
 * below is written to be run twice.
 */
export async function runDueDeletions(
  now: Date = new Date(),
): Promise<DeletionRun> {
  const due = await db
    .select()
    .from(accountDeletions)
    .where(lte(accountDeletions.scheduledFor, now))
    .orderBy(asc(accountDeletions.scheduledFor))
    .limit(BATCH);

  const run: DeletionRun = { completed: [], failed: [] };
  for (const deletion of due) {
    try {
      const done = await deleteAccount(deletion, now);
      if (done) run.completed.push(deletion.userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("account_deletion_failed", {
        userId: deletion.userId,
        error: message,
      });
      await db
        .update(accountDeletions)
        .set({ lastError: message.slice(0, 500) })
        .where(eq(accountDeletions.userId, deletion.userId))
        .catch(() => undefined);
      run.failed.push({ userId: deletion.userId, error: message });
    }
  }
  if (run.completed.length > 0) revalidateOfficers();
  return run;
}

/**
 * One member's deletion, in the order the plan fixes. Returns false when the
 * row was cancelled between listing and starting.
 *
 * `lastAttemptAt` is stamped first, in the same statement that checks the row
 * is still there: `cancelAccountDeletion` only cancels a deletion that has not
 * been stamped, so after this line the deletion runs to the end.
 *
 * The auth user goes partway through, and the row deliberately outlives it
 * (see the table's comment): the audit entry, the email and the row's own
 * removal come after, so a failure there is retried instead of lost. Every
 * earlier step is a no-op once its work is done, and the auth user's absence
 * is the signal to skip them.
 */
async function deleteAccount(deletion: Deletion, now: Date): Promise<boolean> {
  const { userId } = deletion;

  const [claimed] = await db
    .update(accountDeletions)
    .set({
      attempts: sql`${accountDeletions.attempts} + 1`,
      lastAttemptAt: now,
      lastError: null,
    })
    .where(eq(accountDeletions.userId, userId))
    .returning({ userId: accountDeletions.userId });
  if (!claimed) return false;

  const [member] = await db
    .select({ email: usersInAuth.email })
    .from(usersInAuth)
    .where(eq(usersInAuth.id, userId))
    .limit(1);

  let blocked = false;
  let receivers = 0;
  if (member) {
    // Scheduling refused the sole President, but the roles can change during
    // the window. Checked again before anything is removed.
    if (await isSolePresident(userId)) throw new Error(SOLE_PRESIDENT_ERROR);

    // 1. The block first: if anything after it fails, the member is still
    //    refused at sign-up, and if it fails nothing else has happened yet.
    blocked = await blockSubjectIfModerated(userId, member.email ?? "", now);

    // 2. The member's OAuth apps, through the shared removal path. DevDogs
    //    apps (no owner) are never selected.
    await removeMemberOAuthApps(userId);

    // 3. The schedule builder's tables have no foreign key on purpose.
    await eraseScheduleBuilder(userId);

    // 4. Discord roles the platform synced, which nothing reconciles once the
    //    identity is gone.
    await stripSyncedRolesFromGuild(userId);

    // 5. Every registered receiver is owed `user.delete`.
    receivers = await enqueueUserDelete(userId);

    // 6. The auth user. Cascades and set-nulls do the rest.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error && error.status !== 404) {
      throw new Error(`Failed to delete the auth user: ${error.message}`);
    }
  }

  // 7. One `user.deleted` entry, however many runs it took. System-written:
  //    the member is gone and the job did it; who asked is in the earlier
  //    `user.deletion_scheduled` entry.
  await db
    .insert(auditEvents)
    .values(
      accountDeletionAuditEvent({
        actorUserId: null,
        action: "user.deleted",
        userId,
        correlationId: `account-deletion:${userId}`,
        metadata: {
          scheduledFor: deletion.scheduledFor.toISOString(),
          byOfficer:
            deletion.requestedBy !== null && deletion.requestedBy !== userId,
          blocked,
          receivers,
        },
      }),
    )
    .onConflictDoNothing();

  // 8. "Deletion complete". A bounce or a missing sender cannot be fixed by
  //    trying again, so only an unexplained failure keeps the deletion open.
  const sent = await sendTemplate(deletion.email, "AccountDeletionComplete", {
    name: greetingName(deletion.name),
  });
  if (!sent.ok) {
    console.error("account_deletion_email_failed", {
      template: "AccountDeletionComplete",
      reason: sent.reason,
    });
    if (sent.reason === "unknown") {
      throw new Error(`Completion email failed: ${sent.message}`);
    }
  }

  await db.delete(accountDeletions).where(eq(accountDeletions.userId, userId));
  return true;
}

/**
 * A member who deletes their account during a suspension or ban must not come
 * back clean (account-deletion Q42): their UGA address's keyed hash is stored
 * and the sign-up hook refuses a match.
 *
 * A suspension in this platform has no end date and a ban lasts ten years in
 * Supabase terms, so both block with no expiry. Returns whether a block was
 * written. A missing Vault key makes the hash null; that must fail the
 * deletion, not store a block that matches nothing (or everyone).
 */
async function blockSubjectIfModerated(
  userId: string,
  email: string,
  now: Date,
): Promise<boolean> {
  const rows = await db.execute<{ suspended: boolean; banned: boolean }>(sql`
    select
      exists (select 1 from "platform"."userSuspensions" s
              where s."userId" = ${userId}::uuid) as suspended,
      coalesce((select u.banned_until > ${now.toISOString()}::timestamptz
                from auth.users u where u.id = ${userId}::uuid), false) as banned
  `);
  const standing = rows[0];
  if (!standing || (!standing.suspended && !standing.banned)) return false;

  if (!email) {
    throw new Error("Cannot block a moderated member who has no email");
  }
  const written = await db.execute<{ hash: string }>(sql`
    insert into "platform"."deletedAccountBlocks" ("subjectHash", "expiresAt")
    select h.hash, null
    from (select "platform".deleted_account_hash(${email}) as hash) h
    where h.hash is not null
    on conflict ("subjectHash") do update set "expiresAt" = null
    returning "subjectHash" as hash
  `);
  if (written.length === 0) {
    throw new Error(
      "The deleted_account_block_key Vault secret is missing, so a moderated " +
        "member's block cannot be written; the deletion stays pending",
    );
  }
  return true;
}

/** Account deletion has to clean these up itself: they carry no foreign key. */
const SCHEDULE_BUILDER_USER_TABLES = [
  "userPlanDraftCourses",
  "userPlanDrafts",
  "userSavedPlans",
  "userPreferences",
] as const;

async function eraseScheduleBuilder(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    for (const table of SCHEDULE_BUILDER_USER_TABLES) {
      await tx.execute(
        sql`delete from "schedule_builder".${sql.identifier(table)}
            where "userId" = ${userId}::uuid`,
      );
    }
  });
}

/**
 * Owes every external app a `user.delete`, through the same
 * `enqueue_user_standing` the moderation decisions use, then puts what is
 * ready on the queue. Done once: a retry after a later step failed finds the
 * deliveries already recorded and does not send them again. Returns the number
 * of apps owed a message (0 on a retry).
 */
async function enqueueUserDelete(userId: string): Promise<number> {
  const already = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from "platform"."moderationDeliveries"
    where "type" = 'user.delete' and "payload" -> 'data' ->> 'userId' = ${userId}
  `);
  if ((already[0]?.n ?? 0) > 0) return 0;

  const rows = await db.execute<{ ids: string[] }>(sql`
    select to_jsonb("platform".enqueue_user_standing(
      ${userId}::uuid, 'delete', null, null, null
    )) as ids
  `);
  const ids = rows[0]?.ids ?? [];
  if (ids.length === 0) return 0;

  // A delivery recorded as failed (its app has no endpoint) waits for a person
  // and a resend, like every other moderation message.
  const pending = await db.execute<{ id: string }>(sql`
    select "id" from "platform"."moderationDeliveries"
    where "status" = 'pending'
      and "id" in (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
  `);
  await queueDeliveriesQuietly(pending.map((row) => row.id));
  return ids.length;
}

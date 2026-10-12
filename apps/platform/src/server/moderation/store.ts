import { and, eq, isNull, sql } from "drizzle-orm";
import type { ReportRequest } from "@devdogsuga/sdk/moderation";
import { env } from "~/env";
import { db } from "~/server/db";
import { moderationClients, reportReasons } from "~/server/db/schema";
import { oauthClientsInAuth } from "~/supabase/drizzle/schema";
import type { ClientRecord, ReportApiDeps } from "./api";

/** The report API's dependencies, backed by the platform database. */
export function databaseReportApi(): ReportApiDeps {
  return {
    signingKey: env.MODERATION_SIGNING_KEY,
    findClient,
    fileExternal,
    fileSandbox,
  };
}

/**
 * The registration for a client, or null. A client GoTrue has deleted is
 * unknown even if a row is left behind (GoTrue soft-deletes, so the foreign
 * key's cascade never runs; migration 61 also drops the row when it happens).
 */
export async function findClient(
  clientId: string,
): Promise<ClientRecord | null> {
  const [row] = await db
    .select({
      clientId: moderationClients.clientId,
      secretVersion: moderationClients.secretVersion,
      appId: moderationClients.appId,
    })
    .from(moderationClients)
    .innerJoin(
      oauthClientsInAuth,
      eq(oauthClientsInAuth.id, moderationClients.clientId),
    )
    .where(
      and(
        eq(moderationClients.clientId, clientId),
        isNull(oauthClientsInAuth.deletedAt),
      ),
    );
  if (!row) return null;
  const tierRows = await db.execute<{ tier: string | null }>(
    sql`select "platform".moderation_client_tier(${clientId}::uuid) as tier`,
  );
  return { ...row, tier: tierRows[0]?.tier ?? null };
}

async function fileExternal(appId: string, r: ReportRequest) {
  const rows = await db.execute<{ reportId: string; corroborated: boolean }>(
    sql`select * from "platform".file_external_report(
          ${appId}::uuid, ${r.reporterUserId}::uuid, ${r.authorUserId}::uuid,
          ${r.contentType}, ${r.contentRef}, ${r.contentSnapshot},
          ${r.contentUrl ?? null}, ${r.reason}::"platform"."reportReason",
          ${r.description ?? null}
        )`,
  );
  const row = rows[0];
  if (!row) throw new Error("file_external_report returned no row");
  return { reportId: row.reportId, corroborated: row.corroborated };
}

async function fileSandbox(clientId: string, r: ReportRequest) {
  const rows = await db.execute<{ id: string }>(
    sql`select "platform".file_sandbox_report(
          ${clientId}::uuid, ${r.reporterUserId}::uuid, ${r.authorUserId}::uuid,
          ${r.contentType}, ${r.contentRef}, ${r.contentSnapshot},
          ${r.contentUrl ?? null}, ${r.reason}::"platform"."reportReason",
          ${r.description ?? null}
        ) as id`,
  );
  const row = rows[0];
  if (!row) throw new Error("file_sandbox_report returned no row");
  return row.id;
}

/** The reasons an app can offer a reporter, in display order. */
export async function listReportReasons() {
  return db
    .select({
      reason: reportReasons.reason,
      title: reportReasons.title,
      description: reportReasons.description,
    })
    .from(reportReasons)
    .orderBy(reportReasons.position);
}

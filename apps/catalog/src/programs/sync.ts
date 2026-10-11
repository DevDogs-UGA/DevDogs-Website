import { sql } from "drizzle-orm";
import type { ScrapeDb } from "~/db/client";
import { academicPrograms } from "~/db/schema";
import type { BulletinScrape } from "./bulletin";

const UPSERT_BATCH_SIZE = 200;

export interface AcademicProgramSyncReport {
  programs: number;
  pages: number;
  requests: number;
  retries: number;
  syncedAt: string;
}

/**
 * Writes a complete Bulletin scrape into `platform."academicPrograms"` as one
 * transaction.
 *
 * The scrape finishes and validates every rate-limited page before this opens
 * a transaction, so an upstream outage or a markup change leaves the previous
 * catalog intact. Programs the scrape no longer lists are kept, marked
 * `active = false`, because a profile may still reference them.
 */
export async function writeAcademicPrograms(
  db: ScrapeDb,
  scrape: BulletinScrape,
  syncedAt: Date = new Date(),
): Promise<AcademicProgramSyncReport> {
  await db.transaction(async (tx) => {
    // Keep rows referenced by a profile, but stop offering anything the latest
    // complete scrape did not contain. The transaction rolls this back if any
    // upsert fails.
    await tx
      .update(academicPrograms)
      .set({ active: false, updatedAt: syncedAt });

    for (
      let offset = 0;
      offset < scrape.programs.length;
      offset += UPSERT_BATCH_SIZE
    ) {
      const batch = scrape.programs.slice(offset, offset + UPSERT_BATCH_SIZE);
      await tx
        .insert(academicPrograms)
        .values(
          batch.map((program) => ({
            ...program,
            active: true,
            lastSeenAt: syncedAt,
            updatedAt: syncedAt,
          })),
        )
        .onConflictDoUpdate({
          target: academicPrograms.id,
          set: {
            name: sql`excluded."name"`,
            credential: sql`excluded."credential"`,
            category: sql`excluded."category"`,
            schoolCode: sql`excluded."schoolCode"`,
            bulletinUrl: sql`excluded."bulletinUrl"`,
            active: true,
            lastSeenAt: syncedAt,
            updatedAt: syncedAt,
          },
        });
    }
  });

  return {
    programs: scrape.programs.length,
    pages: scrape.pages,
    requests: scrape.requests,
    retries: scrape.retries,
    syncedAt: syncedAt.toISOString(),
  };
}

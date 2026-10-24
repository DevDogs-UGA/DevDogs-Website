import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "~/server/db";
import { oauthRegistrations } from "~/server/db/schema";
import { expectSession } from "~/server/auth";
import { appLogoUrl } from "~/server/loaders/console";
import { missingForPublishing } from "~/server/oauth/appStatus";
import type { OAuthStatus } from "~/server/oauth/status";
import { oauthConsentsInAuth } from "~/supabase/drizzle/schema";

export interface ConnectedApp {
  clientId: string;
  label: string;
  logoUrl: string | null;
  homepageUrl: string | null;
  /** When the member approved it (ISO). */
  approvedAt: string;
}

/**
 * Every app the signed-in member has approved and not removed
 * (`auth.oauth_consents` with no `revoked_at`), newest approval first.
 */
export async function getConnectedApps(): Promise<ConnectedApp[]> {
  const userId = await expectSession();
  const rows = await db
    .select({
      clientId: oauthRegistrations.clientId,
      label: oauthRegistrations.label,
      logoPath: oauthRegistrations.logoPath,
      homepageUrl: oauthRegistrations.homepageUrl,
      approvedAt: oauthConsentsInAuth.grantedAt,
    })
    .from(oauthConsentsInAuth)
    .innerJoin(
      oauthRegistrations,
      eq(oauthRegistrations.clientId, oauthConsentsInAuth.clientId),
    )
    .where(
      and(
        eq(oauthConsentsInAuth.userId, userId),
        isNull(oauthConsentsInAuth.revokedAt),
      ),
    )
    .orderBy(desc(oauthConsentsInAuth.grantedAt));
  return rows.map((row) => ({
    clientId: row.clientId,
    label: row.label,
    logoUrl: appLogoUrl(row.logoPath),
    homepageUrl: row.homepageUrl,
    approvedAt: row.approvedAt.toISOString(),
  }));
}

export interface ConsoleApp {
  clientId: string;
  label: string;
  status: OAuthStatus;
  /** The registering member's preferred name; null for a DevDogs app. */
  ownerName: string | null;
  isDevDogs: boolean;
  asksForConsent: boolean;
  logoUrl: string | null;
  homepageUrl: string | null;
  privacyPolicyUrl: string | null;
  /** What publishing still needs ("a logo", ...); empty when it may go live. */
  missing: string[];
  /** Members holding an approval now: who a return to Testing signs out. */
  approvedMembers: number;
}

/**
 * The apps Console → Apps lists: DevDogs apps (no owner) and members' apps
 * that are In production. The caller must already hold `canManageOAuthApps`.
 */
export async function getConsoleApps(): Promise<ConsoleApp[]> {
  const registrations = await db.query.oauthRegistrations.findMany({
    columns: {
      clientId: true,
      userId: true,
      label: true,
      status: true,
      asksForConsent: true,
      logoPath: true,
      homepageUrl: true,
      privacyPolicyUrl: true,
    },
    where: { OR: [{ status: "in_production" }, { userId: { isNull: true } }] },
    with: { profile: { columns: { preferredName: true } } },
    orderBy: { label: "asc" },
  });
  if (registrations.length === 0) return [];

  const counts = await db
    .select({ clientId: oauthConsentsInAuth.clientId, value: count() })
    .from(oauthConsentsInAuth)
    .where(
      and(
        inArray(
          oauthConsentsInAuth.clientId,
          registrations.map((r) => r.clientId),
        ),
        isNull(oauthConsentsInAuth.revokedAt),
      ),
    )
    .groupBy(oauthConsentsInAuth.clientId);

  return registrations.map((r) => ({
    clientId: r.clientId,
    label: r.label,
    status: r.status,
    ownerName: r.profile?.preferredName ?? null,
    isDevDogs: r.userId === null,
    asksForConsent: r.asksForConsent,
    logoUrl: appLogoUrl(r.logoPath),
    homepageUrl: r.homepageUrl,
    privacyPolicyUrl: r.privacyPolicyUrl,
    missing: missingForPublishing(r),
    approvedMembers: counts.find((c) => c.clientId === r.clientId)?.value ?? 0,
  }));
}

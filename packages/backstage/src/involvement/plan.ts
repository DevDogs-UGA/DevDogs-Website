/**
 * What an import would do, worked out before anything is written.
 *
 * The roster is the whole truth about who is involved: everyone on it is
 * verified, and everyone verified who is not on it loses that status. So the
 * plan is four lists, and the preview prints them before the confirmation.
 *
 * Preferred names are never changed: the roster's spelling may not be the
 * name a member goes by, and the preferred name is what the site shows. A
 * difference is listed for an officer to follow up on.
 *
 * A roster email finds its account by the profile's `ugaEmail` first, then by
 * the sign-in address. Officers often sign in with a personal address and
 * have their MyID one recorded as `ugaEmail`; matching only the sign-in
 * address would make them a second, empty account.
 */
import type { InvolvementMember } from "./csv.js";

/** One account, as the snapshot query reads it. */
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

export interface Match {
  member: InvolvementMember;
  userId: string;
  /** No profile row yet: the import inserts one rather than updating it. */
  hasProfile: boolean;
  /** The profile's preferred name, which the import never changes. */
  preferredName: string | null;
}

export interface ImportPlan {
  /** On the roster with no account: one is created, then verified. */
  create: InvolvementMember[];
  /** Has an account, not verified until now. */
  verify: Match[];
  /** Already verified, still on the roster. */
  keep: Match[];
  /** Verified now, absent from the roster: loses involvement status. */
  drop: { userId: string; name: string }[];
  /** Roster emails that landed on an account another roster email already claimed. */
  sharedAccounts: { email: string; userId: string }[];
  /** Matched members whose preferred name is not the roster's name. Listed, never changed. */
  nameDiffers: Match[];
}

function index(
  rows: readonly AccountRow[],
  key: "authEmail" | "ugaEmail",
): Map<string, AccountRow[]> {
  const map = new Map<string, AccountRow[]>();
  for (const row of rows) {
    const email = row[key];
    if (!email) continue;
    map.set(email, [...(map.get(email) ?? []), row]);
  }
  return map;
}

function nonBlank(value: string | null): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  return v;
}

export function planImport(
  members: readonly InvolvementMember[],
  accounts: readonly AccountRow[],
): ImportPlan {
  const byUga = index(accounts, "ugaEmail");
  const byAuth = index(accounts, "authEmail");
  const plan: ImportPlan = {
    create: [],
    verify: [],
    keep: [],
    drop: [],
    sharedAccounts: [],
    nameDiffers: [],
  };
  const claimed = new Set<string>();

  for (const member of members) {
    const viaUga = byUga.get(member.email);
    const account =
      viaUga?.find((a) => a.authEmail === member.email) ??
      viaUga?.[0] ??
      byAuth.get(member.email)?.[0];
    if (!account) {
      plan.create.push(member);
      continue;
    }
    if (claimed.has(account.userId)) {
      plan.sharedAccounts.push({
        email: member.email,
        userId: account.userId,
      });
      continue;
    }
    claimed.add(account.userId);
    const match = {
      member,
      userId: account.userId,
      hasProfile: account.hasProfile,
      preferredName: account.preferredName,
    };
    const rosterName = `${member.firstName} ${member.lastName}`.toLowerCase();
    if (
      account.hasProfile &&
      account.preferredName?.trim().toLowerCase() !== rosterName
    ) {
      plan.nameDiffers.push(match);
    }
    if (account.involvementFirstName != null) plan.keep.push(match);
    else plan.verify.push(match);
  }

  for (const account of accounts) {
    if (account.involvementFirstName == null || claimed.has(account.userId)) {
      continue;
    }
    plan.drop.push({
      userId: account.userId,
      name:
        nonBlank(account.preferredName) ??
        `${account.involvementFirstName} ${account.involvementLastName ?? ""}`.trim(),
    });
  }
  plan.drop.sort((a, b) => a.name.localeCompare(b.name));
  return plan;
}

/** Everyone the import writes a profile for, created accounts excluded. */
export function matches(plan: ImportPlan): Match[] {
  return [...plan.verify, ...plan.keep];
}

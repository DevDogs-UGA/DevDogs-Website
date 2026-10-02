/**
 * What an attendance import would do to one meeting, before anything is
 * written.
 *
 * A member's own check-in (`qr`, `manual_code`) is never touched: the sheet
 * can only add the people who could not check in. Imported rows carry method
 * `import`, so `--replace` can find exactly the rows an earlier import wrote
 * and remove the ones the corrected sheet no longer lists.
 */
import { accountFinder, type AccountRow } from "../production/accounts.js";
import type { Attendee } from "./sheet.js";

/** A check-in already on the meeting. */
export interface ExistingCheckIn {
  userId: string;
  method: string;
}

export interface Matched {
  attendee: Attendee;
  userId: string;
}

export interface AttendancePlan {
  /** Has an account, not yet checked in: recorded. */
  record: Matched[];
  /** No account: one is created (named from the sheet), then recorded. */
  create: Attendee[];
  /** No account and no name on the sheet to create one with. */
  cannotCreate: Attendee[];
  /** Checked in themselves. Left as is. */
  checkedIn: (Matched & { method: string })[];
  /** Recorded by an earlier import. Left as is. */
  imported: Matched[];
  /** `--replace` only: imported earlier, not on this sheet. Removed. */
  remove: { userId: string; name: string }[];
}

export const IMPORT_METHOD = "import";

export function planAttendance(
  attendees: readonly Attendee[],
  accounts: readonly AccountRow[],
  existing: readonly ExistingCheckIn[],
  replace: boolean,
): AttendancePlan {
  const find = accountFinder(accounts);
  const methodOf = new Map(existing.map((e) => [e.userId, e.method]));
  const plan: AttendancePlan = {
    record: [],
    create: [],
    cannotCreate: [],
    checkedIn: [],
    imported: [],
    remove: [],
  };
  const onSheet = new Set<string>();

  for (const attendee of attendees) {
    const account = find(attendee.email);
    if (!account) {
      (attendee.name ? plan.create : plan.cannotCreate).push(attendee);
      continue;
    }
    if (onSheet.has(account.userId)) continue;
    onSheet.add(account.userId);
    const match = { attendee, userId: account.userId };
    const method = methodOf.get(account.userId);
    if (method === undefined) plan.record.push(match);
    else if (method === IMPORT_METHOD) plan.imported.push(match);
    else plan.checkedIn.push({ ...match, method });
  }

  if (replace) {
    const byId = new Map(accounts.map((a) => [a.userId, a]));
    for (const e of existing) {
      if (e.method !== IMPORT_METHOD || onSheet.has(e.userId)) continue;
      const account = byId.get(e.userId);
      plan.remove.push({
        userId: e.userId,
        name:
          account?.preferredName?.trim() ??
          account?.ugaEmail ??
          account?.authEmail ??
          e.userId,
      });
    }
    plan.remove.sort((a, b) => a.name.localeCompare(b.name));
  }
  return plan;
}

/**
 * A link that arrived when the right folder wasn't open. Opening a folder
 * reloads the window and restarts the extension host, so the link is parked
 * in globalState and resumed after activation. It expires so a stale link
 * from last week never fires on its own.
 */

export interface PendingLink {
  path: string;
  query: string;
  savedAt: number;
}

export const PENDING_TTL_MS = 10 * 60 * 1000;

/** Validates whatever came back out of globalState. */
export function readPending(raw: unknown): PendingLink | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { path, query, savedAt } = raw as Record<string, unknown>;
  if (
    typeof path !== "string" ||
    typeof query !== "string" ||
    typeof savedAt !== "number"
  ) {
    return undefined;
  }
  return { path, query, savedAt };
}

export function isPendingFresh(pending: PendingLink, now: number): boolean {
  return now >= pending.savedAt && now - pending.savedAt <= PENDING_TTL_MS;
}

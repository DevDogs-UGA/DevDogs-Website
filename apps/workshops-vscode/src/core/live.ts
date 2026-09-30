import { latestWorkshop } from "./branches.js";
import type { Step } from "./tags.js";

/**
 * The pure half of "Follow live workshops": reading the relay's messages,
 * building the one message we send, deciding when to reconnect, and deciding
 * what to do when the presenter finishes a step. No vscode, no sockets.
 *
 * The relay is apps/slides/worker/relay.ts; its `attend` role is described in
 * apps/slides/LAYOUTS.md ("Attendees"). We receive
 *   { t: "live", live: boolean }                 a presenter is (not) connected
 *   { t: "checkpoint", id, ref, tracks: [...] }  the presenter finished step `ref`
 * and send only
 *   { t: "step", step: N }                       the step number we've reached
 */

export type LiveTrack = "web" | "mobile";

/** Web-Workshops is the web track, Mobile-Workshops the mobile one. */
export function trackOfRepo(repo: string): LiveTrack | undefined {
  const name = repo.split("/")[1]?.toLowerCase();
  if (name === "web-workshops") return "web";
  if (name === "mobile-workshops") return "mobile";
  return undefined;
}

/** `<base>?track=web`, or undefined when `base` isn't a ws:// or wss:// URL. */
export function attendUrl(base: string, track: LiveTrack): string | undefined {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return undefined;
  }
  if (url.protocol !== "wss:" && url.protocol !== "ws:") return undefined;
  url.searchParams.set("track", track);
  return url.toString();
}

export type RelayEvent =
  | { kind: "live"; live: boolean }
  | { kind: "checkpoint"; id: string; ref: string };

/** Same shape the presenter's laptop checks: `<workshop>/<NN>-<slug>`. */
const CHECKPOINT_REF = /^[\w.-]+\/\d\d-[\w.-]+$/;

/**
 * Reads one relay message. Anything unexpected is undefined (ignored): a
 * checkpoint for another track, a malformed ref, other message types.
 */
export function parseRelayMessage(
  raw: string,
  track: LiveTrack,
): RelayEvent | undefined {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof message !== "object" || message === null) return undefined;
  const m = message as Record<string, unknown>;
  if (m["t"] === "live" && typeof m["live"] === "boolean")
    return { kind: "live", live: m["live"] };
  if (
    m["t"] === "checkpoint" &&
    typeof m["ref"] === "string" &&
    CHECKPOINT_REF.test(m["ref"])
  ) {
    if (!Array.isArray(m["tracks"]) || !m["tracks"].includes(track))
      return undefined;
    return {
      kind: "checkpoint",
      id: typeof m["id"] === "string" ? m["id"] : "",
      ref: m["ref"],
    };
  }
  return undefined;
}

/** The only message we send: the step number reached (0: none yet). */
export function stepMessage(step: number): string {
  return JSON.stringify({ t: "step", step });
}

/**
 * The number to report: the current step's `NN` when it belongs to the newest
 * workshop in the repo, else 0. (Step 3 of last workshop must not count as
 * step 3 of tonight's.)
 */
export function reportableStep(
  line: readonly Step[],
  current: Step | null,
): number {
  if (!current || current.number <= 0) return 0;
  const latest = latestWorkshop([...new Set(line.map((s) => s.workshop))]);
  return current.workshop === latest ? Math.min(current.number, 99) : 0;
}

export interface Backoff {
  /** First delay ceiling, ms. */
  baseMs?: number;
  /** Ceiling on the ceiling, ms. */
  maxMs?: number;
}

/**
 * Reconnect delay for the `attempt`th failure in a row (0-based): exponential
 * with "equal jitter", so a room reconnecting after a deploy spreads out
 * instead of arriving together. Between half the ceiling and the whole of it.
 */
export function backoffDelay(
  attempt: number,
  random: () => number = Math.random,
  { baseMs = 1000, maxMs = 60_000 }: Backoff = {},
): number {
  const ceiling = Math.min(maxMs, baseMs * 2 ** Math.min(attempt, 30));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

// -- what to do when the presenter finishes a step --------------------------

export type CheckpointDecision =
  /** Not a step of this clone (even after fetching), or not a numbered step. */
  | "ignore"
  /** They already have it. */
  | "have"
  /** A review is open: offer it when that review ends. */
  | "queue"
  | "offer";

const indexOfTag = (line: readonly Step[], tag: string) =>
  line.findIndex((s) => s.tag === tag);

export function decideCheckpoint(input: {
  ref: string;
  line: readonly Step[];
  /** `findCurrentStep`: the newest step already in their history. */
  current: Step | null;
  reviewing: boolean;
}): CheckpointDecision {
  const target = indexOfTag(input.line, input.ref);
  if (target < 0 || (input.line[target]?.number ?? 0) <= 0) return "ignore";
  if (input.current && indexOfTag(input.line, input.current.tag) >= target)
    return "have";
  return input.reviewing ? "queue" : "offer";
}

/** What's waiting for the attendee: a step they put off, and one that arrived mid-review. */
export interface OfferState {
  /** Newest step they said "Later" to (the badge). */
  badge?: string;
  /** Newest step announced during a review. */
  queued?: string;
}

/** The later step of two refs, by position in the line. */
function newer(
  line: readonly Step[],
  a: string | undefined,
  b: string,
): string {
  if (a === undefined) return b;
  return indexOfTag(line, a) >= indexOfTag(line, b) ? a : b;
}

export function defer(
  state: OfferState,
  ref: string,
  line: readonly Step[],
): OfferState {
  return { ...state, badge: newer(line, state.badge, ref) };
}

export function queue(
  state: OfferState,
  ref: string,
  line: readonly Step[],
): OfferState {
  return { ...state, queued: newer(line, state.queued, ref) };
}

/** Forgets whatever the attendee has caught up to. */
export function prune(
  state: OfferState,
  line: readonly Step[],
  current: Step | null,
): OfferState {
  const at = current ? indexOfTag(line, current.tag) : -1;
  const pending = (ref: string | undefined) => {
    const index = ref === undefined ? -1 : indexOfTag(line, ref);
    return ref !== undefined && index > at ? ref : undefined;
  };
  const next: OfferState = {};
  const badge = pending(state.badge);
  const queued = pending(state.queued);
  if (badge) next.badge = badge;
  if (queued) next.queued = queued;
  return next;
}

/**
 * A review ended. Finished: offer the queued step now. Cancelled: don't
 * pester, but keep it as a badge so it isn't lost.
 */
export function afterReview(
  state: OfferState,
  finished: boolean,
  line: readonly Step[],
): { state: OfferState; offer: string | undefined } {
  const { queued, ...rest } = state;
  if (queued === undefined) return { state, offer: undefined };
  return finished
    ? { state: rest, offer: queued }
    : { state: defer(rest, queued, line), offer: undefined };
}

/** "Presenter finished Step 3: Insert naive". */
export function offerText(step: Step): string {
  return `Presenter finished Step ${step.number}: ${step.title || step.slug}`;
}

import type { ModerationEvent } from "./messages.js";
import {
  signedHeaders,
  type SignedHeaders,
} from "./signing.js";

/**
 * Signed sample deliveries, for testing a receiver without the platform.
 *
 * The secret is the Standard Webhooks documentation's example, public and
 * worthless: never configure it anywhere that matters. Timestamps are fixed,
 * so a test passes `{ now: SAMPLE_NOW }` to the verifier and gets the same
 * bytes every run.
 */
export const SAMPLE_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";

/** The instant the samples were "sent". */
export const SAMPLE_NOW = new Date("2026-10-12T12:00:00.000Z");

const OWNER = "11111111-1111-4111-8111-111111111111";
const MODERATOR_TARGET = "22222222-2222-4222-8222-222222222222";

/** Events in the order a moderator took the decisions. */
export const SAMPLE_EVENTS = {
  ping: {
    id: "msg_sample_ping",
    type: "ping",
    occurredAt: "2026-10-12T11:59:00.000Z",
    data: {},
  },
  hide: {
    id: "msg_sample_hide",
    type: "content.hide",
    occurredAt: "2026-10-12T11:58:00.000Z",
    data: {
      contentType: "session",
      contentId: "session-1",
      ownerId: OWNER,
      reportId: "rep_sample_1",
      reason: "Reported as spam",
    },
  },
  /** Decided BEFORE `hide`: delivered late, a receiver must ignore it. */
  restoreOlder: {
    id: "msg_sample_restore_older",
    type: "content.restore",
    occurredAt: "2026-10-12T11:30:00.000Z",
    data: {
      contentType: "session",
      contentId: "session-1",
      ownerId: OWNER,
    },
  },
  restore: {
    id: "msg_sample_restore",
    type: "content.restore",
    occurredAt: "2026-10-12T11:59:30.000Z",
    data: {
      contentType: "session",
      contentId: "session-1",
      ownerId: OWNER,
    },
  },
  remove: {
    id: "msg_sample_remove",
    type: "content.remove",
    occurredAt: "2026-10-12T11:57:00.000Z",
    data: {
      contentType: "session",
      contentId: "session-2",
      ownerId: OWNER,
    },
  },
  suspend: {
    id: "msg_sample_suspend",
    type: "user.suspend",
    occurredAt: "2026-10-12T11:56:00.000Z",
    data: {
      userId: MODERATOR_TARGET,
      until: "2026-11-12T00:00:00.000Z",
      reason: "Repeated harassment reports",
    },
  },
  unsuspend: {
    id: "msg_sample_unsuspend",
    type: "user.unsuspend",
    occurredAt: "2026-10-12T11:59:45.000Z",
    data: { userId: MODERATOR_TARGET },
  },
} as const satisfies Record<string, ModerationEvent>;

export interface SampleDelivery {
  name: keyof typeof SAMPLE_EVENTS;
  event: ModerationEvent;
  headers: SignedHeaders;
  /** The exact text the signature covers. */
  body: string;
}

/** One sample, signed. */
export async function signSample(
  name: keyof typeof SAMPLE_EVENTS,
  options: { secret?: string; now?: Date } = {},
): Promise<SampleDelivery> {
  const event: ModerationEvent = SAMPLE_EVENTS[name];
  const body = JSON.stringify(event);
  return {
    name,
    event,
    body,
    headers: await signedHeaders(
      options.secret ?? SAMPLE_SECRET,
      event.id,
      body,
      { now: options.now ?? SAMPLE_NOW },
    ),
  };
}

/** Every sample, signed, in the order they are declared. */
export async function signedSamples(
  options: { secret?: string; now?: Date } = {},
): Promise<SampleDelivery[]> {
  const names = Object.keys(SAMPLE_EVENTS) as (keyof typeof SAMPLE_EVENTS)[];
  return Promise.all(names.map((name) => signSample(name, options)));
}

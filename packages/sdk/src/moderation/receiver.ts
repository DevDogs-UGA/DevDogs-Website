import {
  moderationEventSchema,
  subjectOf,
  type ModerationEvent,
} from "./messages.js";
import {
  verifyMessage,
  WebhookVerificationError,
  type VerifyOptions,
} from "./signing.js";

/**
 * A reference receiver for the platform's deliveries: the rules an app's
 * moderation endpoint follows, with the storage left to the caller.
 *
 * DogPack's Edge Function (`supabase/functions/platform-moderation`) does the
 * same three things against Postgres (`moderation_events` for the ids,
 * `moderation.apply_event` for the rest). This one runs against an in-memory
 * store, which is what the platform's own tests and the console's sandbox
 * use, and what a contributor reads to see the contract in thirty lines.
 *
 *   1. **Authenticate.** The signature is the only credential.
 *   2. **Apply once.** A message id seen before is acknowledged and not
 *      applied again, so the platform's retries are safe.
 *   3. **Apply in order.** An event older than the last decision applied to
 *      the same subject is acknowledged and ignored.
 */

export interface ReceiverStore {
  hasMessage(id: string): boolean | Promise<boolean>;
  recordMessage(id: string): void | Promise<void>;
  lastDecisionAt(subject: string): string | undefined | Promise<string | undefined>;
  recordDecision(subject: string, occurredAt: string): void | Promise<void>;
}

export function createMemoryReceiverStore(): ReceiverStore & {
  readonly messages: ReadonlySet<string>;
  readonly decisions: ReadonlyMap<string, string>;
} {
  const messages = new Set<string>();
  const decisions = new Map<string, string>();
  return {
    messages,
    decisions,
    hasMessage: (id) => messages.has(id),
    recordMessage: (id) => void messages.add(id),
    lastDecisionAt: (subject) => decisions.get(subject),
    recordDecision: (subject, occurredAt) =>
      void decisions.set(subject, occurredAt),
  };
}

export type ReceiveOutcome =
  /** The event was new and in order; `apply` ran. */
  | { status: "applied"; event: ModerationEvent }
  /** A redelivery of a message already applied. Acknowledged, not re-applied. */
  | { status: "duplicate"; id: string }
  /** Older than the last decision on the same subject. Acknowledged, ignored. */
  | { status: "stale"; event: ModerationEvent }
  /** A `ping`: acknowledged, nothing to apply. */
  | { status: "pinged"; event: ModerationEvent }
  /** Not accepted. `unauthenticated` is 401; `malformed` is 400. */
  | { status: "unauthenticated"; reason: string }
  | { status: "malformed"; reason: string };

export interface ReceiveResult {
  /** The HTTP status to answer with. Anything below 300 stops the sender's retries. */
  httpStatus: 200 | 400 | 401;
  outcome: ReceiveOutcome;
}

export interface ReferenceReceiverOptions {
  secret: string;
  store: ReceiverStore;
  /** What to do with a new, in-order event. */
  apply: (event: ModerationEvent) => void | Promise<void>;
  verify?: VerifyOptions;
}

export function createReferenceReceiver(options: ReferenceReceiverOptions) {
  return {
    /** Handles one delivery: the request's headers and its raw body text. */
    async handle(
      headers: Parameters<typeof verifyMessage>[1],
      body: string,
    ): Promise<ReceiveResult> {
      let messageId: string;
      try {
        messageId = await verifyMessage(
          options.secret,
          headers,
          body,
          options.verify,
        );
      } catch (error) {
        if (error instanceof WebhookVerificationError) {
          return {
            httpStatus: 401,
            outcome: { status: "unauthenticated", reason: error.reason },
          };
        }
        throw error;
      }

      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        return {
          httpStatus: 400,
          outcome: { status: "malformed", reason: "the body is not JSON" },
        };
      }
      const parsed = moderationEventSchema.safeParse(json);
      if (!parsed.success) {
        return {
          httpStatus: 400,
          outcome: { status: "malformed", reason: parsed.error.message },
        };
      }
      const event = parsed.data;

      if (await options.store.hasMessage(messageId)) {
        return { httpStatus: 200, outcome: { status: "duplicate", id: messageId } };
      }

      const subject = subjectOf(event);
      if (subject === null) {
        await options.store.recordMessage(messageId);
        return { httpStatus: 200, outcome: { status: "pinged", event } };
      }

      const last = await options.store.lastDecisionAt(subject);
      if (last !== undefined && Date.parse(event.occurredAt) < Date.parse(last)) {
        await options.store.recordMessage(messageId);
        return { httpStatus: 200, outcome: { status: "stale", event } };
      }

      await options.apply(event);
      await options.store.recordDecision(subject, event.occurredAt);
      await options.store.recordMessage(messageId);
      return { httpStatus: 200, outcome: { status: "applied", event } };
    },
  };
}

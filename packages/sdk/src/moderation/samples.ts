/**
 * Signed sample messages: the fixture an app's receiver and its
 * `apply_event` are tested against, and what `devtools moderation send` and
 * the console's "Send test action" build their bodies from.
 */
import type { ModerationMessage, MessageType } from "./messages.js";
import type { Outcome } from "./receiver.js";
import { signMessage, type SignedHeaders } from "./signing.js";

/** A well-known secret for samples. Never a real client's. */
export const SAMPLE_SECRET =
  "whsec_c2FtcGxlLW1vZGVyYXRpb24tc2VjcmV0LW5vdC1yZWFs";

export const SAMPLE_CONTENT = {
  contentType: "session",
  contentRef: "00000000-0000-4000-8000-0000000000a1",
} as const;
export const SAMPLE_USER_ID = "00000000-0000-4000-8000-0000000000b1";

export interface BuildMessageInput {
  type: MessageType;
  /** ISO 8601. Defaults to now. */
  timestamp?: string;
  contentType?: string;
  contentRef?: string;
  userId?: string;
  reason?: string | null;
  reportId?: string | null;
}

/** A message of any type, with sample targets unless told otherwise. */
export function buildMessage(input: BuildMessageInput): ModerationMessage {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const reportId = input.reportId ?? null;
  if (input.type.startsWith("content.")) {
    return {
      type: input.type as Extract<MessageType, `content.${string}`>,
      timestamp,
      data: {
        contentType: input.contentType ?? SAMPLE_CONTENT.contentType,
        contentRef: input.contentRef ?? SAMPLE_CONTENT.contentRef,
        reportId,
      },
    };
  }
  return {
    type: input.type as Extract<MessageType, `user.${string}`>,
    timestamp,
    data: {
      userId: input.userId ?? SAMPLE_USER_ID,
      reason: input.reason ?? null,
      reportId,
    },
  };
}

export interface SignedSample {
  name: string;
  /** What a correct receiver does with it, when the samples are sent in order. */
  expected: Outcome;
  headers: SignedHeaders;
  body: string;
}

export interface SampleOptions {
  secret?: string;
  /** Epoch milliseconds the sequence is anchored to. Defaults to now. */
  now?: number;
  /**
   * Distinguishes this run's message ids from every other run's. A receiver
   * remembers the ids it has seen, so a second run against the same database
   * would otherwise see all of them as duplicates. Defaults to a random value.
   */
  runId?: string;
  /**
   * The content item the content samples act on. Defaults to a fresh one per
   * run, so a receiver's per-item ordering (a restore dated after the hide)
   * from one run can never make the next run's hide look stale, however soon
   * it starts.
   */
  contentRef?: string;
}

/**
 * The conformance sequence. Send it in order to a fresh receiver:
 *
 * 1. hide a session: applied
 * 2. the same message again: duplicate
 * 3. a restore dated before the hide: stale
 * 4. a restore dated after it: applied
 * 5. suspend a user: applied
 * 6. a user restore dated before the suspension: stale
 *
 * Every message is signed for "now", so it is inside the five-minute window
 * however old its decision timestamp is.
 */
export async function signedSamples(
  options: SampleOptions = {},
): Promise<SignedSample[]> {
  const secret = options.secret ?? SAMPLE_SECRET;
  const now = options.now ?? Date.now();
  const at = (offsetSeconds: number) =>
    new Date(now + offsetSeconds * 1000).toISOString();
  const signedAt = Math.floor(now / 1000);
  const run = options.runId ?? Math.random().toString(36).slice(2, 10);
  const messageId = (n: number) => `msg_sample_${run}_${n}`;
  const contentRef = options.contentRef ?? crypto.randomUUID();

  async function sample(
    name: string,
    id: string,
    expected: Outcome,
    message: ModerationMessage,
  ): Promise<SignedSample> {
    const body = JSON.stringify(message);
    return {
      name,
      expected,
      body,
      headers: await signMessage(secret, body, { id, timestamp: signedAt }),
    };
  }

  const hide = buildMessage({
    type: "content.hide",
    timestamp: at(0),
    contentRef,
  });
  return [
    await sample("hide a session", messageId(1), "applied", hide),
    await sample("replay of the hide", messageId(1), "duplicate", hide),
    await sample(
      "a restore dated before the hide",
      messageId(2),
      "stale",
      buildMessage({
        type: "content.restore",
        timestamp: at(-60),
        contentRef,
      }),
    ),
    await sample(
      "a restore dated after the hide",
      messageId(3),
      "applied",
      buildMessage({
        type: "content.restore",
        timestamp: at(1),
        contentRef,
      }),
    ),
    await sample(
      "suspend a user",
      messageId(4),
      "applied",
      buildMessage({
        type: "user.suspend",
        timestamp: at(0),
        reason: "sample suspension",
      }),
    ),
    await sample(
      "a user restore dated before the suspension",
      messageId(5),
      "stale",
      buildMessage({ type: "user.restore", timestamp: at(-60) }),
    ),
  ];
}

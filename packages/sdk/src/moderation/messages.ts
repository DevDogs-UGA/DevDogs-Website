import { z } from "zod";

/**
 * The moderation protocol: what an app files with the platform (a report) and
 * what the platform sends back after a moderator decides (an event).
 *
 * These schemas are the source. `@devdogsuga/sdk-spec` exports them as JSON
 * Schema (`moderation/schema.json`) and the Dart SDK's models are generated
 * from that file, so a change here that is not regenerated fails the drift
 * check.
 *
 * Both directions travel as Standard Webhooks messages (see `./signing.ts`):
 * `webhook-id`, `webhook-timestamp` and `webhook-signature` headers over the
 * raw JSON body, HMAC-SHA256, one signing secret per OAuth client.
 */

/** Bumped only for a breaking change to a message shape. */
export const MODERATION_PROTOCOL_VERSION = 1;

/** The paths the platform serves, under the platform Worker's origin. */
export const MODERATION_API_BASE_PATH = "/moderation/v1";

/** A platform user id: the `sub` of the DevDogs identity. */
const platformUserId = z.uuid();

/** Why a user reported something. */
export const REPORT_REASONS = [
  "spam",
  "harassment",
  "inappropriate",
  "safety",
  "other",
] as const;

export const reportReasonSchema = z.enum(REPORT_REASONS);

/**
 * A report, filed by an app over HTTPS: the content as it was when the
 * reporter saw it (`snapshot`), who wrote it (`ownerId`), who reported it
 * (`reporterId`, the reporter's platform user id).
 */
export const moderationReportSchema = z.object({
  /** What kind of thing is reported, in the app's own words: `session`. */
  contentType: z.string().min(1).max(64),
  /** The app's id for it. Opaque to the platform. */
  contentId: z.string().min(1).max(128),
  ownerId: platformUserId,
  reporterId: platformUserId,
  reason: reportReasonSchema,
  details: z.string().max(1000).optional(),
  /** The content as reported. Small, flat and JSON: the console shows it. */
  snapshot: z.record(z.string(), z.unknown()),
  /** When the reporter filed it, if the app queued it. Defaults to receipt. */
  reportedAt: z.iso.datetime().optional(),
});

export type ModerationReport = z.infer<typeof moderationReportSchema>;

/** What the platform answers a report with. */
export const moderationReportReceiptSchema = z.object({
  reportId: z.string().min(1),
  status: z.literal("received"),
});

export type ModerationReportReceipt = z.infer<
  typeof moderationReportReceiptSchema
>;

const eventBase = {
  /** The message id. The receiver records it, so a redelivery applies once. */
  id: z.string().min(1).max(128),
  /**
   * When the moderator decided. A receiver ignores an event older than the
   * last decision it applied to the same subject, so a late retry cannot
   * undo a newer decision.
   */
  occurredAt: z.iso.datetime(),
};

const contentEventData = z.object({
  contentType: z.string().min(1).max(64),
  contentId: z.string().min(1).max(128),
  ownerId: platformUserId,
  reportId: z.string().min(1).optional(),
  reason: z.string().max(500).optional(),
});

/** Hide or remove sets the content's `quarantinedBy`; restore clears it. */
export const contentEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...eventBase,
    type: z.literal("content.hide"),
    data: contentEventData,
  }),
  z.object({
    ...eventBase,
    type: z.literal("content.remove"),
    data: contentEventData,
  }),
  z.object({
    ...eventBase,
    type: z.literal("content.restore"),
    data: contentEventData,
  }),
]);

export const userEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...eventBase,
    type: z.literal("user.suspend"),
    data: z.object({
      userId: platformUserId,
      /** Null: until a moderator lifts it. */
      until: z.iso.datetime().nullable(),
      reason: z.string().max(500).optional(),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal("user.unsuspend"),
    data: z.object({ userId: platformUserId }),
  }),
]);

/** The console's "Send test action": proves the pipe end to end. */
export const pingEventSchema = z.object({
  ...eventBase,
  type: z.literal("ping"),
  data: z.object({}),
});

export const moderationEventSchema = z.union([
  contentEventSchema,
  userEventSchema,
  pingEventSchema,
]);

export type ModerationEvent = z.infer<typeof moderationEventSchema>;
export type ModerationEventType = ModerationEvent["type"];

/** Every event type, in the order the console lists them. */
export const MODERATION_EVENT_TYPES = [
  "content.hide",
  "content.remove",
  "content.restore",
  "user.suspend",
  "user.unsuspend",
  "ping",
] as const satisfies readonly ModerationEventType[];

/**
 * What an event is about, for ordering: two events with the same subject are
 * ordered by `occurredAt`; events about different subjects never conflict.
 * `ping` has no subject.
 */
export function subjectOf(event: ModerationEvent): string | null {
  switch (event.type) {
    case "content.hide":
    case "content.remove":
    case "content.restore":
      return `content:${event.data.contentType}:${event.data.contentId}`;
    case "user.suspend":
    case "user.unsuspend":
      return `user:${event.data.userId}`;
    case "ping":
      return null;
  }
}

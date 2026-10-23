import type { auditEvents } from "~/server/db/schema";

/**
 * Audit entries for production OAuth clients (`/console/audit-log`).
 *
 * A production client is the credential a DevDogs app signs its members in
 * with, so creating one, deleting one, rolling its secret and changing where
 * it may send people are all recorded: who, which client, and in what state.
 * Development clients are a member's own test tool and are not audited (a
 * workshop mints dozens in an hour).
 *
 * The rows are plain `platform."auditEvents"` inserts, append-only like every
 * other entry; `targetType` is `oauth_client` and `targetId` is the client id.
 * Never put a secret in `metadata`.
 */
export const OAUTH_AUDIT_ACTIONS = [
  "oauth_client.created",
  "oauth_client.deleted",
  // The owner's account was deleted while they still owned a production
  // client, so ownership was cleared (the client becomes a DevDogs app)
  // instead of the client being deleted along with sign-in.
  "oauth_client.owner_cleared",
  "oauth_client.secret_rotated",
  "oauth_client.redirect_uri_added",
  "oauth_client.redirect_uri_removed",
  // Registering a client as a moderation app, rotating its signing secret and
  // changing its endpoint. The secret is derived per client, not stored, but
  // rotating it cuts off the app's reports until it is updated, so it is
  // recorded like the OAuth secret; the endpoint decides where a decision about
  // a member is sent.
  "oauth_client.moderation_registered",
  "oauth_client.moderation_secret_rotated",
  "oauth_client.moderation_endpoint_changed",
] as const;

export type OAuthAuditAction = (typeof OAUTH_AUDIT_ACTIONS)[number];

export const OAUTH_AUDIT_TARGET_TYPE = "oauth_client";

export function oauthAuditEvent(input: {
  actorUserId: string;
  action: OAuthAuditAction;
  clientId: string;
  metadata: Record<string, string | number | boolean | null>;
}): typeof auditEvents.$inferInsert {
  return {
    actorType: "user",
    actorUserId: input.actorUserId,
    source: "platform",
    action: input.action,
    targetType: OAUTH_AUDIT_TARGET_TYPE,
    targetId: input.clientId,
    metadata: { tier: "production", ...input.metadata },
  };
}

---
name: Apps outside the platform database
description: "How an app with its own database (DogPack) files reports and receives moderators' decisions, with the signed report API, the signed deliveries, the receiver rules, registration, and the three ways to test it."
order: 3
section: guides
---

# Apps outside the platform database

[Moderation](./index.md) and [Reporting](../reporting/index.md) describe apps that share the platform's Postgres: a table becomes reportable by gaining a foreign key, and a decision is applied by SQL. An app with its **own** Supabase project (DogPack) cannot work that way, so it talks to the platform over HTTPS in both directions, with messages signed by one shared secret.

```text
member taps Report
  -> your `report` Edge Function
       POST /moderation/v1/reports        (signed with your client's secret)
  -> the platform: a report in the moderators' queue
  -> a moderator decides in the console
  -> the decision commits together with its deliveries (platform."moderationDeliveries")
  -> Cloudflare Queue -> signed POST to your `platform-moderation` Edge Function
  -> `moderation.apply_event(...)` hides the content, bans the user
```

The platform stores nothing it can sign with. A client's secret is derived from a root key held by the Worker, the client id and a version number, so a database dump leaks nothing. Rotating a secret is bumping the version.

## The secret

Each OAuth client has one signing secret (`whsec_...`, [Standard Webhooks](https://www.standardwebhooks.com/)). It signs your reports **and** verifies the platform's deliveries. Turn moderation on for a client on [`/tools/oauth`](/tools/oauth) under **Moderation**; the secret is shown once. **Rotate** invalidates the old one at once, so update your function's secret in the same minute.

Every message carries three headers:

| Header              | Meaning                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| `webhook-id`        | unique per message; the platform sends `msg_<delivery id>`             |
| `webhook-timestamp` | unix seconds; a message more than **5 minutes** from your clock fails  |
| `webhook-signature` | `v1,<base64 HMAC-SHA256 of "<id>.<timestamp>.<raw body>">`             |

`@devdogsuga/sdk/moderation` does all of it (`signMessage`, `verifyMessage`) with Web Crypto only, so it runs in a Worker, a Deno Edge Function or Node.

## Filing a report

`POST https://api.devdogsuga.org/moderation/v1/reports` (staging: `api-staging.devdogsuga.org`), from your backend, never a member's device.

Headers: the three above, `moderation-client-id: <your OAuth client id>`, `content-type: application/json`.

```json
{
  "reporterUserId": "<platform user id of the member reporting>",
  "authorUserId": "<platform user id of the member who wrote it>",
  "contentType": "session",
  "contentRef": "<your row's id>",
  "contentSnapshot": "what it said when reported (max 5000)",
  "contentUrl": "https://dogpack.example/s/…",
  "reason": "harassment",
  "description": "optional, required for 'other' (max 1000)"
}
```

The platform user id is the DevDogs identity's subject: `auth.identities.provider_id` where `provider = 'custom:devdogsuga'`. `GET /moderation/v1/reasons` returns the reasons to offer.

| Status | `error.code`                                  | Meaning                                                        |
| ------ | --------------------------------------------- | -------------------------------------------------------------- |
| 201    | none                                          | `{ reportId, corroborated, sandbox }`                          |
| 400    | `invalid_json`, `invalid_request`             | the body, or a missing description for `other`                 |
| 401    | `missing_client`, `unknown_client`, `bad_signature` | the client is not registered for moderation, or the signature is wrong |
| 403    | `reporter_not_allowed`                        | the reporter is suspended or an OAuth test account             |
| 422    | `unknown_content_type`, `unknown_user`        | the type was not declared at registration; a user id is not a platform user |
| 429    | `rate_limited`                                | ten reports an hour per reporter                               |
| 503    | `not_configured`                              | the platform has no signing key yet                            |

A second report of content that already has an open report becomes a corroboration (`corroborated: true`). The SDK's `createModerationClient` does the signing and maps these errors.

## Receiving decisions

The platform POSTs to the endpoint URL you registered. Six message types:

| `type`                                     | Means                                                  |
| ------------------------------------------ | ------------------------------------------------------ |
| `content.hide` / `content.remove`          | set `quarantinedBy`; RLS hides the row from everyone but its author |
| `content.restore`                          | clear it                                               |
| `user.suspend` / `user.ban`                | a Supabase `ban_duration` on the user with that DevDogs identity |
| `user.restore`                             | lift it                                                |

```json
{ "type": "content.hide", "timestamp": "2027-01-01T00:00:00.000Z",
  "data": { "contentType": "session", "contentRef": "…", "reportId": "…" } }
{ "type": "user.ban", "timestamp": "…", "data": { "userId": "…", "reason": "harassment", "reportId": "…" } }
```

`reason` is the report's category. A moderator's private note never leaves the platform.

**Your receiver must:**

1. **Verify the signature** against the raw body, and answer 401 when it fails. The function's JWT check is off; the signature is the authentication.
2. **Be idempotent.** Record `webhook-id` in a `moderation_events` table and answer 2xx for one you have seen. The platform retries, and a console resend reuses the id.
3. **Be order-safe.** Ignore (but acknowledge) a message whose `timestamp` is older than the last decision applied to the same item (`content:<type>:<ref>` or `user:<id>`).
4. Answer **2xx** once handled, including for a duplicate or a stale message, and **5xx** only for a failure worth retrying.

Anything but a 2xx is retried with a growing delay (30 s doubling to an hour, about ten tries). After that the delivery is dead-lettered: it is marked failed, an alert is raised, and the report page in the console shows a **Resend** button. A delivery to an app with no endpoint is recorded as failed immediately instead of being dropped. A 15-minute cron re-queues any delivery the queue never received.

`createReceiver` in `@devdogsuga/sdk/moderation` is the reference implementation of all of it, with an in-memory store. Port its three rules to SQL in `apply_event`; do not invent others.

## Registering a production app

An officer registers an OAuth client as a production app on the moderation console (**Apps Outside the Platform**): a slug, a name, the client id, the endpoint URL (`https`, a public hostname) and one content type per line, `type | Label | https://app/{ref}`. Reports from that client then reach the moderators. Re-registering a slug updates it; pointing it at another client moves the registration and the old client goes back to being a development client.

A client that is **not** registered is a development client, and its reports go to a sandbox only its owner reads (below).

## Testing, in three layers

1. **The SDK.** `signedSamples()` is a six-message sequence: a hide is applied, its replay is a duplicate, a restore dated before it is stale, a later restore is applied, a suspension is applied, and an older user restore is stale. Run it against your receiver in CI.
2. **The sandbox.** With a development client, your backend's reports appear under **Sandbox reports** on `/tools/oauth` and never in the moderators' queue. **Send test action** sends a real signed delivery to your endpoint (`https` and public) and shows what it answered.
3. **Local Docker.** `pnpm devtools moderation send content.hide --content-ref <id>` signs a message and POSTs it to your local Edge Function (default `http://127.0.0.1:54321/functions/v1/platform-moderation`). `--replay` sends it twice, `--stale` dates it a minute ago, and `pnpm devtools moderation samples` runs the whole sequence and reports pass or fail. Secrets: `--secret`, or `PLATFORM_MODERATION_SECRET`, or the well-known sample secret.

## Operating notes

- The root key is the Worker secret `MODERATION_SIGNING_KEY`. Without it the API answers 503 and no delivery is signed. Changing it changes **every** client's secret.
- The queues are `<tier>-moderation-deliveries` and `<tier>-moderation-deliveries-dlq`, created with `wrangler queues create`. The dead-letter consumer calls `postAlert`.
- Staging runs no crons, so a delivery that missed the queue there is re-queued by hitting `/cron/moderation-deliveries` by hand with the staging `CRON_SECRET`.

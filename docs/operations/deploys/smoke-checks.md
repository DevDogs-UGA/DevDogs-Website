---
name: Smoke checks
description: The no-login checks that guard sign-in, where they run, what they may touch in production, and what to do when the failing-smoke issue opens.
order: 7
section: infrastructure
---

# Smoke checks

Every product signs members in through the platform, so a broken OAuth hand-off is an outage for all of them at once. These checks need no login and run in three places.

| Where                | When                                 | Touches                                                                            |
| -------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| `deploy-worker.yaml` | Before the traffic switch, and after | The version being deployed; a throwaway OAuth client on that tier.                 |
| `smoke.yaml`         | Every six hours                      | Staging: a throwaway client and a rolled-back transaction. Production: reads only. |
| The pull request     | Every pull request that touches SQL  | A scratch database. See [Destructive changes](./destructive-changes.md).           |

## The three checks

1. The authorize endpoint redirects to the platform's consent page, and the version under test answers that consent URL without a server error. The throwaway client exists only in Supabase and has no platform registration, so the platform's own answer is a **404** (a client it does not know is a 404 before sign-in); only a 5xx or a connection error fails the check.
2. The consent page answers 404 without an `authorization_id`.
3. The access-token hook downgrades an OAuth client's token to `oauth_identity` (a database check against staging, in a transaction that is always rolled back).

The same run also loads the public pages of the platform and checks that a protected page sends an anonymous visitor to sign in. The pages and hosts come from `workers.json`.

## What production may and may not do

Production gets **reads only on a timer**: the discovery document must advertise an authorize endpoint, and the consent page must 404. Registering a client or touching the database in production happens only inside an approved deploy, never on a schedule. That is why the scheduled production job runs in `production-build` (public variables, no secrets, no reviewers) and not in `production`, which would wait for an approver.

## When it fails

A failing scheduled run opens one issue labelled `smoke-failure`, and comments on it while it keeps failing. Work in this order:

1. Open the run and read which check failed.
2. **Consent page is not 404, or authorize does not redirect:** the platform Worker or the Supabase OAuth server is wrong. Check the last deploy, then the Supabase project's auth settings (`oauth_server_enabled`), then [Sign-in is down](../incidents/sign-in-down.md).
3. **Hook check fails (staging):** a migration changed `platform.restrict_oauth_tokens`. Fix forward.
4. **A public page is not 200:** compare with [Rolling back](./rollback.md); a fresh deploy is the usual cause.
5. **Staging only, nothing else red:** the free staging project may be paused after a week idle. Restore it in the Supabase dashboard.

Close the issue once the next scheduled run is green.

## Uptime monitoring

Sentry's plan here allows one uptime monitor, spent on the apex. This workflow is the alerting for everything else; GitHub emails the people watching the repository when it fails.

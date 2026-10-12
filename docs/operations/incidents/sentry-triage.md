---
name: Triaging Sentry
description: A weekly routine for the Sentry projects - what to look at, how to decide fix, ignore or resolve, and the alerts that must never be ignored.
order: 2
section: infrastructure
---

# Triaging Sentry

Sentry has one project per deployed thing: the platform, schedule-builder, the catalog, and the developer tools. Errors arrive tagged with the **release** (the commit SHA) and the **environment** (`staging` or `production`). Triage weekly, and always after a production deploy that touched something users reach.

## The routine (fifteen minutes)

1. **Filter to production, unresolved, last seven days.** Staging noise is expected; do not mix them.
2. **New issues first.** Sort by _first seen_. An issue first seen on the latest release is that release's bug until proven otherwise.
3. **Then the loud ones.** Sort by events, then users. One user, one event, a bot-shaped path: ignore.
4. **Decide for each issue**, in one line:
   - **Fix:** it is ours and it hurts. Open an issue in the repository, link the Sentry issue, assign it.
   - **Resolve in next release:** fixed, waiting on a deploy. Sentry reopens it if it recurs.
   - **Ignore, with a reason:** third-party noise, a browser extension, a crawler. Archive it _until escalating_ rather than forever.
5. **Check the crons.** Each scheduled job reports a check-in; a missed or failed check-in is an alert, not noise.

## Alerts that are never noise

- A cron that stops checking in (role sync, the catalog scrape, the newsletter jobs). The deploy prunes monitors the app no longer declares, so a monitor that goes quiet is real.
- Anything in the sign-in path: `auth`, `oauth`, `consent`. Go to [Sign-in is down](./sign-in-down.md).
- A spike right after a deploy. Compare the release; [roll back](../deploys/rollback.md) if it is the deploy.

## Reading an issue

The release tells you the commit; the breadcrumbs tell you what the request did; the **source map** should make the stack readable. If the stack shows minified names, the release's source maps did not upload - look at the deploy's release step.

A Worker that exceeds its memory limit shows as a platform error, not a Sentry issue, and appears in `wrangler tail` and the Cloudflare dashboard instead. The catalog's daily scrape is the usual suspect ([term rollover](../releases/catalog-term-rollover.md)).

## Keeping it small

An inbox you never reach zero is an inbox nobody reads. If the count creeps up, spend the next triage deleting noise rather than adding alert rules. See [Sentry](../credentials/sentry.md) for who owns the account and what the plan allows.

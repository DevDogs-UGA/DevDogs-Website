---
name: Sentry
description: The error and cron monitoring organization - owner, admins, the tokens CI uses and the public DSNs, how to rotate, and recovery.
order: 5
section: infrastructure
---

# Sentry

## Owner and admins

- **Owner:** the DevOps/Platform officer, who also triages ([Triaging Sentry](../incidents/sentry-triage.md)).
- **Admins:** the President and the Vice President are organization owners.

## What it issues

| Credential                                  | Used for                                                                                                     | Where                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `SENTRY_AUTH_TOKEN`                         | Creating releases and uploading source maps from CI                                                          | The `staging` and `production` environments                  |
| `SENTRY_MONITORS_TOKEN`                     | Deleting Sentry Crons monitors the app no longer declares. **Can delete monitors and alert rules org-wide.** | `production` only, and only the one step that prunes sees it |
| DSNs (platform, schedule-builder, devtools) | Where the apps send errors                                                                                   | Public variables; safe in a browser bundle                   |

The monitor token is deliberately separate from the auth token and is passed to a single step, because of what it can delete. If it is absent, the prune step prints a notice and skips.

## Rotating

1. In Sentry, create a new internal-integration token with the same scopes (releases and source maps for the auth token; monitors and alert rules for the other).
2. Replace it in the GitHub environment secret.
3. Re-run a deploy; the release step proves it works.
4. Revoke the old token.

A DSN is not a secret; rotating one (a new client key) means changing the variable and redeploying, and is only worth doing to cut off spam.

## The uptime monitor

The plan allows **one** uptime monitor, spent on the apex. Other availability alerting is the scheduled smoke workflow ([Smoke checks](../deploys/smoke-checks.md)). If the monitor is disabled it silently stops alerting; check that it is enabled when you take over.

## Recovery

- **Lost access:** an organization owner re-invites the officer. Releases and source maps can be re-uploaded by re-running a deploy.
- **No source maps in an issue:** the release did not upload. Check the `Create the Sentry release` step in the last deploy; a missing `SENTRY_AUTH_TOKEN` is a warning, not a failure, so the deploy still goes out.
- **The alert rule stopped reaching Discord:** the rule's action, not the token, owns that. Open the rule and re-select the channel.

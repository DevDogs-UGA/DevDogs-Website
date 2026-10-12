---
name: Discord
description: The club server's bot, application and webhooks - owner, admins, what each credential does, how to rotate, and recovery.
order: 7
section: infrastructure
---

# Discord

## Owner and admins

- **Owner:** the DevOps/Platform officer owns the **Discord application** (the bot and the sign-in client). The server itself is owned by the President.
- **Admins:** the President and the Vice President hold the Administrator role on the server and are team members on the application, so the application never lives only under one person's account.

## What it issues

| Credential                                                | Used for                                                | Lives in                                            |
| --------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| `DISCORD_TOKEN`                                           | The bot: role sync, posting                             | Bitwarden, then the Worker                          |
| `DISCORD_PUBLIC_KEY`                                      | Verifying interaction requests                          | Bitwarden, then the Worker (public by nature)       |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`              | Members signing in with Discord                         | Bitwarden; sent to Supabase by `config push`        |
| `DISCORD_SUPPORT_WEBHOOK_URL`, `DISCORD_SUPPORT_FORUM_ID` | The docs-to-support bridge                              | Bitwarden, then the Worker                          |
| Slides snippet webhooks                                   | The deck posting code snippets to the workshop channels | Set on the slides Worker with `wrangler secret put` |

A webhook URL is a secret: anyone with it can post as the webhook.

## Rotating

- **The bot token:** in the application's _Bot_ page, reset the token, put the new value in Bitwarden, push and deploy. The old token stops working the moment you reset, so do it with a deploy ready.
- **The client secret:** reset on the _OAuth2_ page, put it in Bitwarden, push and deploy (the deploy's `config push` hands it to Supabase), test a Discord sign-in.
- **A webhook:** delete it in the channel's settings, create a new one, replace the secret.

## Recovery

- **Lost the application:** a team member on the Discord application adds the new owner. This is why it is a team, not a personal application.
- **Role sync stopped:** the cron reports to Sentry; see [Triaging Sentry](../incidents/sentry-triage.md). The usual causes are a rotated token and a bot role that fell below the roles it assigns in the server's role order.
- **The server is lost:** the President holds the ownership; see the club succession notes. Nothing in the platform depends on the guild id changing, but the Worker's guild setting must be updated.

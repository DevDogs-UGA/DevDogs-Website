---
name: GitHub
description: The organization, its Apps and OAuth app, and the tokens - who owns them, how to rotate each, and what to do if both owners are unreachable.
order: 2
section: infrastructure
---

# GitHub

## Owner and admins

- **Owner of the account:** the DevOps/Platform officer runs it day to day.
- **Organization owners:** the President and the Vice President. Only they can change organization settings ([Owner-only actions](../repositories/owner-actions.md)).
- **Admins:** the `admins` team, a break-glass bypass on the rulesets.

## What it issues

| Credential                                                                            | Used for                                                                                | Lives in                             |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------ |
| The platform GitHub App (`GH_APP_ID`, `GH_APP_INSTALLATION_ID`, `GH_APP_PRIVATE_KEY`) | The platform's organization administration: teams, invitations                          | Bitwarden, then the Worker's secrets |
| The GitHub OAuth app (`GH_CLIENT_ID`, `GH_CLIENT_SECRET`)                             | Members signing in with GitHub; accepting the organization invitation                   | Bitwarden, Supabase auth config      |
| `GH_WEBHOOK_SECRET`                                                                   | Verifying GitHub webhooks                                                               | Bitwarden, the Worker                |
| `WORKSHOPS_READ_TOKEN`                                                                | A fine-grained token that reads the private workshop repositories, for the slides build | A repository secret                  |
| Renovate                                                                              | A GitHub App (Mend's), installed by an owner                                            | The App's own installation           |

The OAuth app and the platform App are different things with different lifetimes. Rotating one never signs anybody out of the other; see [The DevDogs GitHub App](../../toolkit/infrastructure/github-app.md) for why both exist.

## Rotating

- **The App's private key:** in the App's settings, generate a new key, put it in Bitwarden as `GH_APP_PRIVATE_KEY`, push, deploy, then delete the old key. Installation tokens expire in an hour, so nothing else needs doing.
- **The OAuth client secret:** generate a second secret in the OAuth app, put it in Bitwarden as `GH_CLIENT_SECRET`, push, run the deploy (its `config push` sends the secret to Supabase), sign in with GitHub to test, then delete the old secret.
- **`WORKSHOPS_READ_TOKEN`:** create a new fine-grained token with _Contents: read_ on the workshop repositories and this one, replace the repository secret, re-run the slides workflow, then revoke the old token. Whoever created the old one must revoke it from their own account.
- **A personal account leaving:** remove them from the organization, then check for tokens, Apps and secrets they created (Settings, Developer settings are per-account and invisible to the rest of us).

## Recovery

- **Lost access to the DevOps account:** an organization owner adds another officer to `devops` and `admins`. No credential is held only by that person.
- **Both owners unreachable:** contact GitHub Support and prove control of the club: the organization's verified domain (`devdogsuga.org`, a DNS record) and the club mailbox are the evidence. Keep that DNS access with the Cloudflare account ([Cloudflare](./cloudflare.md)) so there is always a second route. Do not plan around this; keep two owners.
- **A compromised App key:** delete the key at once; the platform stops managing teams until a new one is deployed, and nothing else breaks.

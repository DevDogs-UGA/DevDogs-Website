---
name: Credentials
description: Where every club credential lives, who owns it, and the one rotation routine - with a page per service for owner, admins, the credentials it issues, and recovery.
order: 1
section: infrastructure
---

# Credentials

There is one rule for every secret the club holds: **Bitwarden Secrets Manager is the source of truth, and GitHub environment secrets are a derived copy.** Nobody keeps a credential only in their head, a personal password manager, or a laptop's `.env`.

## The services

| Service         | Page                               | Typical credential                                              |
| --------------- | ---------------------------------- | --------------------------------------------------------------- |
| GitHub          | [GitHub](./github.md)              | Apps, the OAuth app, a read token for the workshop repos        |
| Cloudflare      | [Cloudflare](./cloudflare.md)      | The scoped deploy token, the zone, Access for slides            |
| Supabase        | [Supabase](./supabase.md)          | Management token, database roles, secret keys, JWT signing keys |
| Sentry          | [Sentry](./sentry.md)              | Auth and monitor tokens, DSNs                                   |
| npm and pub.dev | [npm and pub.dev](./registries.md) | Trusted Publishing; no long-lived token                         |
| Discord         | [Discord](./discord.md)            | The bot, the public key, the support webhook                    |
| Google Cloud    | [Google Cloud](./google-cloud.md)  | The OAuth client, the Maps key                                  |
| Bitwarden       | [Bitwarden](./bitwarden.md)        | The vault itself and the machine account                        |

Each page has the same four parts: **Owner**, **Admins**, **What it issues** and **Recovery**.

Owners and admins are named by **role** (the DevOps/Platform officer, the President, the Vice President). The people holding the roles change every year; the current names are in the club's private succession notes, not in this repository.

## The rotation routine

For a secret a Worker reads (an API key, a client secret):

1. Create the new value at the service. Keep the old one valid.
2. Put it in Bitwarden, in the project for the target (`staging`, then `production`).
3. Push it to the GitHub environment: `pnpm backstage env push --target staging` (production asks twice and is never run unattended).
4. Run a deploy. Every deploy uploads the complete set of a Worker's secrets, so the new value reaches the Worker with no other step.
5. Confirm the thing that uses it works, then revoke the old value at the service.

For a credential only the pipeline reads (the Cloudflare token, the Supabase management token, database URLs) skip step 4: change the GitHub environment secret and re-run the failed or next workflow.

A product's credentials follow the same routine with `--repo`: `backstage env push --repo dogdays --target production` writes the `dogdays-production` project and then DogDays' own `production` GitHub environment, and `backstage env audit --repo dogdays --target production` compares the file, Bitwarden and GitHub. Use it instead of `gh secret set` once the product's Bitwarden projects exist (see [the commands](../../toolkit/guides/env/commands.md#product-repositories)).

`pnpm backstage env audit --target production` lists what a Worker holds that nothing declares any more: run it after a rotation, and prune what it reports.

## When you suspect a leak

Treat it as rotated already: rotate first, then look for how it leaked. In order: revoke at the service, replace per the routine above, search the repository history and logs for the old value, and note it in a private incident issue. Never paste a secret into an issue, a pull request, or Discord.

## What is not a credential

A publishable (anon) key, a Sentry DSN, a Turnstile site key and the Maps browser key are public by design and live in plain variables. The Maps key is restricted by referrer at Google; that restriction is its protection.

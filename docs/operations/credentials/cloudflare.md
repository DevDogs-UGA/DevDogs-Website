---
name: Cloudflare
description: The account that serves the Workers, the DNS zone and the Access gate for the slides - owner, admins, the deploy token, and recovery.
order: 3
section: infrastructure
---

# Cloudflare

## Owner and admins

- **Owner:** the DevOps/Platform officer, on a club-owned login. The account is the club's, not a person's.
- **Admins:** the President and the Vice President hold the super-administrator role on the account. DNS lives in the same account, so whoever recovers one recovers the other.

## What it issues

| Credential                                          | Used for                                                 | Lives in                                                              |
| --------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`                              | Deploying Workers, queues and routes from CI             | Bitwarden, then the `staging` and `production` GitHub environments    |
| The zone `devdogsuga.org`                           | The site, `api.devdogsuga.org`, `staging.`, mail records | The account                                                           |
| Access application for `slides-sync.devdogsuga.org` | Keeping the workshop deck private                        | The account (`ACCESS_AUD` is a public identifier in `wrangler.jsonc`) |
| Turnstile site and secret keys                      | Bot checks on forms                                      | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public), `TURNSTILE_SECRET_KEY`     |

The deploy token is **scoped**: Workers scripts, routes and queues for the account, and read on the zone. It cannot edit DNS. Records are changed by a person in the dashboard, which is deliberate.

## Rotating the deploy token

1. In the dashboard, create a new API token with the same permissions as the old one (copy them from the old token's page).
2. Put it in Bitwarden, push it to `staging` and `production` (`pnpm backstage env push`), and run any workflow that deploys.
3. Revoke the old token.

A deploy that fails with `Authentication error` or `Could not determine account` means the token is wrong or lost a permission. The account id is pinned in each `wrangler.jsonc`, so a token that cannot list accounts still works.

## Common tasks

- **A DNS change** (the API hostname, a verification record): dashboard, DNS, by an administrator. The staging API hostname is a proxied placeholder record so Worker routes can attach to it.
- **A queue or Hyperdrive that does not exist yet:** created once with `wrangler`, by the officer; the config names them but does not create them.

## Recovery

- **Lost the login:** both administrators can add another. If neither can sign in, use Cloudflare's account recovery with the club mailbox; keep that mailbox's recovery codes in Bitwarden.
- **The token leaked:** revoke it first. Deploys stop working until the replacement is in; production keeps serving the version it has.
- **A bad DNS edit took the site down:** the dashboard keeps an audit log of changes. Re-create the record, check `curl -I https://devdogsuga.org`, then [Smoke checks](../deploys/smoke-checks.md).

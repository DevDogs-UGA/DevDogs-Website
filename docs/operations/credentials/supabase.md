---
name: Supabase
description: The Pro organization, the staging organization and the product projects - who owns them, the database roles and keys, how to rotate each, and what never to do to the JWT signing keys.
order: 4
section: infrastructure
---

# Supabase

## Owner and admins

- **Owner:** the DevOps/Platform officer. The Pro organization ("DevDogs") holds production for the platform and the two products; a separate free organization ("DevDogs (Staging)") holds the staging projects.
- **Admins:** the President and the Vice President are owners of both organizations.

## What it issues

| Credential                     | Used for                                                                           | Where                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`        | `supabase config push` and the Management API (custom OAuth provider registration) | The `production` environment (and `staging`, when added)       |
| `DB_URL` (deploy tier)         | Migrations and the declarative diff                                                | The environment's secret                                       |
| `DB_URL` (`migration_planner`) | Reading the schema before anything is approved                                     | The `preflight` environment's secret. **Read-only by design.** |
| `SECRET_KEY`                   | The service-role key, for admin calls and the smoke test's throwaway client        | Bitwarden, then the Worker                                     |
| Publishable key                | Public; in variables                                                               | Plain variable                                                 |
| JWT signing keys               | Signing every session                                                              | Supabase (asymmetric, ES256)                                   |
| Provider client secrets        | Discord, GitHub, Google, LinkedIn sign-in                                          | Pushed by `config push`                                        |

Planning and approving use different roles on purpose: the plan runs before any human has agreed to it, so it holds a credential that cannot change anything.

## Rotating

- **Database password or roles:** reset in the dashboard, update `DB_URL` in the right environment, re-run the workflow. The Workers connect through Hyperdrive, which holds its own copy; update the Hyperdrive configuration with `wrangler hyperdrive update` in the same sitting or the Workers lose the database.
- **`SECRET_KEY`:** create a new secret key in the project's API settings, push it, deploy, then delete the old one.
- **The management token:** create a new access token in the account's settings, replace `SUPABASE_ACCESS_TOKEN`, delete the old one.

## Never rotate the JWT signing keys back to a symmetric key

Production signs with an asymmetric ES256 key. The project also lists older and standby symmetric keys. **Do not promote a standby symmetric key to current.** Every product verifies sessions against the project's published keys; switching algorithm breaks verification for everyone until they refetch, and makes sessions forgeable by anyone holding the shared secret. If the signing key must change, rotate to a **new asymmetric key** and let the old one stay as "previously used" until its sessions expire.

## Recovery

- **A paused staging project** (free projects pause after a week idle): restore it in the dashboard. Deploys classify it as paused and skip, rather than fail.
- **Lost production access:** an owner of the organization adds the officer. Production data has daily backups on the Pro plan; a restore is a dashboard action by an owner.
- **A project moved to a new reference:** see [The vanity-subdomain switch](../deploys/vanity-subdomain-switch.md) for what depends on the hostname.

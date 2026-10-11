---
name: Identity
description: The two DevDogs identities — the OAuth provider other projects sign users in with, and the GitHub App the platform authenticates as — and which one you actually need.
order: 1
section: guides
---

# Identity

Two things in this repository are called "the DevDogs identity", and they point in opposite directions. Read the row that matches what you are doing and skip the other.

|              | [Sign in with DevDogs](../../../_shared/getting-started/running.md) | [The DevDogs GitHub App](../../../toolkit/infrastructure/github-app.md)                    |
| ------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| What it is   | DevDogs Auth acting as an OAuth 2.1 / OIDC provider                 | the machine account the platform (`apps/platform` in Backstage) authenticates as on GitHub |
| Direction    | **inbound** — another project signs a DevDogs member in             | **outbound** — the platform administers the `DevDogsUGA` organization                      |
| Who needs it | a sibling project adding a sign-in button                           | whoever deploys or operates the platform                                                   |
| Credential   | a client id and secret, per project, from `/tools/oauth`            | `GH_APP_ID`, `GH_APP_INSTALLATION_ID` and `GH_APP_PRIVATE_KEY`                             |
| Set up by    | `pnpm devtools oauth`, run in the consuming project                 | by hand in GitHub's UI, once, then `backstage env push`                                    |

The difference that matters: one issues identity to other people's apps, the other is an identity the platform holds. Neither authenticates the other.

## Who can create an account

DevDogs Auth accepts new public users only when their email is in the exact
`uga.edu` domain. The `before_user_created` hook in `supabase/config.toml` calls
`platform.require_uga_signup_email`, so the same check covers password and OAuth
signup paths before an Auth user is written. Supabase's service-role admin API
intentionally bypasses Auth hooks; possession of that key is already database
administrator authority and must remain server-only.

## Two tiers of client

Every OAuth client is registered at `/tools/oauth` with a tier, chosen once at creation; a database trigger refuses any later change.

|                | Development                                                                            | Production                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| For            | a member's own local-stack testing                                                     | a DevDogs app (DogDays, DogPack) signing its members in                                                                           |
| Created by     | any member with a linked GitHub account, or `devtools oauth`                           | only someone holding `canManageOAuthApps` (President and DevOps Director)                                                         |
| Visible to     | its owner                                                                              | everyone holding `canManageOAuthApps`                                                                                             |
| Consent        | only the owner sees the form, and approves as themselves or one of their test accounts | approved automatically for whoever is signed in                                                                                   |
| Return address | any `http(s)` URI                                                                      | only `https://<project>.supabase.co/auth/v1/callback`: a product's own Supabase project                                           |
| Audited        | no                                                                                     | creating, deleting, rolling the secret and changing a redirect URI each write an entry to `/console/audit-log` (`oauth_client.*`) |

The consent page (`/oauth/consent`) decides on the server, before anything renders. A request with no `authorization_id`, a stale one, a client nobody registered, a production client whose authorization does not return to a Supabase callback, or a development client that is not yours, all get the same 404.

A production client cannot be deleted until another live production client exists: the delete form names the replacement, and the audit entry records it. Roll a production secret from `/tools/oauth`; it is shown once. Each audited change and its GoTrue call share one transaction, so an entry never exists for a change that did not happen, and a secret is never rolled without its entry.

Unlinking GitHub on `/account` deletes the member's development clients (they are gated on GitHub) and never touches a production client, whoever created it.

## What a Sign in with DevDogs token is good for

A client's tokens are limited by the `custom_access_token` hook (`platform.restrict_oauth_tokens`), which only downgrades. Whatever the tier, and whoever signed in, a token that carries an OAuth client gets `role = oauth_identity`, which has no database privileges, on the first code exchange and on every refresh. The userinfo endpoint answers it; the same token sent to the platform's REST, Storage or RPC endpoints is refused with `permission denied`. A token with no client (the platform's own sign-in) passes through untouched.

Who may sign in to which client is the consent page's job, not the hook's. One gap is accepted: GoTrue's own consent endpoint accepts any signed-in session, so a member with a script could approve someone else's _development_ client as themselves. All they get is the downgraded identity token.

## The issuer

The issuer a product registers is whatever the platform's discovery document returns (`<API_URL>/auth/v1/.well-known/openid-configuration`), shown with a copy button on `/tools/oauth`. It is Supabase's to choose, not ours: it is the project's `https://<project>.supabase.co/auth/v1`, GoTrue stamps it on every ID token, and a provider configured with any other string, a custom domain included, fails its check. After any change to the host in front of the platform project, run `pnpm --dir apps/platform exec tsx scripts/check-oauth-issuer.ts --api-url <url>` and register what it prints.

## A third thing, easily confused with both

The GitHub **OAuth app** — configured as `[auth.external.github]` in `supabase/config.toml` with `GH_CLIENT_ID` and `GH_CLIENT_SECRET` — is what links a member's GitHub profile to their Supabase identity. It is not either column above, and the GitHub App does **not** replace it: member login needs an OAuth scope that GitHub Apps do not have at all. That is the first thing the [GitHub App](../../../toolkit/infrastructure/github-app.md) page covers, and getting it wrong silently breaks the day a student joins.

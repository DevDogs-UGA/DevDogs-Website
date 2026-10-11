---
name: Identity
description: The DevDogs identity other projects sign users in with, how an account is created, and what an OAuth token is good for.
order: 1
section: guides
---

# Identity

"The DevDogs identity" means one thing: **Sign in with DevDogs**, DevDogs Auth acting as an OAuth 2.1 / OIDC provider. It is **inbound**: another project signs a DevDogs member in. Whoever adds a sign-in button to a sibling project needs it; the credential is a client id and secret, per project, from `/tools/oauth`, and `pnpm devtools oauth` sets it up in the consuming project. See [Getting started: Running](../../../_shared/getting-started/running.md).

The platform used to hold a second identity, a GitHub App it authenticated as to administer the `DevDogsUGA` organization (teams, branch rulesets, invitations). That integration is deleted along with Teams and competitions, and its credentials (`GH_APP_ID`, `GH_APP_INSTALLATION_ID`, `GH_APP_PRIVATE_KEY`, `GH_WEBHOOK_SECRET`) are gone from the env contract. The platform no longer calls GitHub as an App, and linking a GitHub account does not add anyone to the organization.

## Who can create an account

DevDogs Auth accepts new public users only when their email is in the exact
`uga.edu` domain. The `before_user_created` hook in `supabase/config.toml` calls
`platform.require_uga_signup_email`, so the same check covers password and OAuth
signup paths before an Auth user is written. Supabase's service-role admin API
intentionally bypasses Auth hooks; possession of that key is already database
administrator authority and must remain server-only.

## What a Sign in with DevDogs token is good for

Sign in with DevDogs is for local development only. Deployed apps share the platform's own sign-in and never use it. A client's tokens are limited to match, by the `custom_access_token` hook (`platform.restrict_oauth_tokens`):

- **Who:** a token is issued only to the member who registered the client at `/tools/oauth`, or to one of that member's test accounts. Any other account, and any client with no registration, is refused at the code exchange and again on every refresh.
- **What:** an issued token carries `role = oauth_identity`, which has no database privileges. The userinfo endpoint answers it, and that is all your local stack should need: GoTrue reads userinfo once, creates a local user, and issues its own session. The same token sent to the platform's REST, Storage or RPC endpoints is refused with `permission denied`.

## How a member's GitHub profile is linked

The GitHub **OAuth app**, configured as `[auth.external.github]` in `supabase/config.toml` with `GH_CLIENT_ID` and `GH_CLIENT_SECRET`, is what links a member's GitHub profile to their Supabase identity. Linking it is one of the verification steps and is needed to register an OAuth client. It requests only `user:email` and does not add the member to the GitHub organization.

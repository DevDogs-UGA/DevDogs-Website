---
name: Google Cloud
description: The Google Cloud project behind Google sign-in and the DogDays Maps key - owner, admins, the credentials, rotation and recovery.
order: 8
section: infrastructure
---

# Google Cloud

## Owner and admins

- **Owner:** the DevOps/Platform officer, through the club's Google Cloud project.
- **Admins:** the President and the Vice President are project owners. Add a second owner before you rely on the project; a project with one owner is one lost account from being unmanageable.

## What it issues

| Credential                                                | Used for                       | Lives in                                                                        |
| --------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| OAuth client (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) | Members signing in with Google | Bitwarden; sent to Supabase by `config push`                                    |
| Maps browser key                                          | DogDays' map and route views   | A public variable and the committed `.env.example`; restricted by HTTP referrer |

The Maps key is **public by design** - it ships in the page. Its protection is the restriction at Google: HTTP referrers limited to the club's hostnames (`dogdays.dev`, `staging.dogdays.dev`, local development) and the Maps APIs limited to the ones DogDays uses. Check the restriction after every domain change.

## Rotating

- **The OAuth client secret:** add a new secret on the client's page, put it in Bitwarden, push, edit `supabase/config-push.stamp` and deploy (the config is pushed only when `config.toml`, a seed or the stamp changed), test a Google sign-in, then delete the old secret. The client has two redirect URIs per project (the Supabase callback); keep them in step with [the vanity-subdomain switch](../deploys/vanity-subdomain-switch.md).
- **The Maps key:** create a new key with the same restrictions, change the variable and the example, deploy, then delete the old key. A key that leaked is harmless if the referrer restriction held; check that first.

## Recovery

- **Sign-in with Google fails with `redirect_uri_mismatch`:** the callback URL Supabase uses is missing from the client's authorized redirect URIs. Add it.
- **The OAuth consent screen is in testing mode:** only listed test users can sign in. It must be published for the club domain.
- **Lost project access:** a project owner adds the officer. Without one, Google's account recovery with the club mailbox is the only route.

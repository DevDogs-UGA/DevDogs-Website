---
name: The vanity-subdomain switch
description: Moving the platform's production Supabase project from the api.devdogsuga.org custom domain to the devdogsuga.supabase.co vanity subdomain, and giving api.devdogsuga.org to the Workers - in order, with the checks.
order: 6
section: infrastructure
---

# The vanity-subdomain switch

Until this is done, `api.devdogsuga.org` is a **custom domain** on the platform's production Supabase project (a paid add-on). After it, the project answers on the **vanity subdomain** `devdogsuga.supabase.co`, and `api.devdogsuga.org` is a proxied record in our Cloudflare zone that routes two paths to Workers: `/catalog/v1/*` to the catalog and `/moderation/v1/*` to the platform. The products use `dogdays.supabase.co` and `dogpack.supabase.co` from the start.

A project cannot have a custom domain and a vanity subdomain at once, so **sign-in is down between step 1 and step 4**. Do it when nobody is registering, with two people on the call: someone with the Supabase org and someone with Cloudflare DNS.

## Before you start

- The platform Worker is deployed with the `/moderation/v1/*` route and the catalog Worker with `/catalog/v1/*`. Both are dormant until DNS changes, and `.github/scripts/check-routes.mjs` pins the table.
- You know the project ref (`crhqsbngqmwtsplabmhj`) and have the Supabase CLI logged in as an org owner.
- The vanity name is free: `supabase vanity-subdomains check-availability --desired-subdomain devdogsuga --project-ref <ref>`.
- An announcement is posted: everyone is signed out once.

## Steps

1. **Delete the custom hostname.** Sign-in is now down.

   ```sh
   supabase domains delete --project-ref <ref>
   ```

2. **Activate the vanity subdomain.**

   ```sh
   supabase vanity-subdomains activate --desired-subdomain devdogsuga --project-ref <ref>
   ```

3. **Re-register the sign-in providers' callback.** Discord, GitHub, Google and LinkedIn each list `https://api.devdogsuga.org/auth/v1/callback`. Add `https://devdogsuga.supabase.co/auth/v1/callback` to each (LinkedIn also needs the OpenID Connect product enabled). Keep the old one until step 7.
4. **Point the apps at the new host.** Change `API_URL` (and the derived public Supabase URL) in the `production` and `production-build` GitHub environments, then run the production deploy so the Workers are rebuilt with it. Sign-in works again once this lands.
5. **Give the hostname to the Workers.** In the `devdogsuga.org` zone, delete the old record for `api` (a DNS-only CNAME to Supabase) and the custom-hostname verification records, then add a **proxied** record for `api` (the placeholder `AAAA 100::` that `api-staging` already uses). Only now do the two routes start receiving traffic.
6. **Check.**
   - `curl https://devdogsuga.supabase.co/auth/v1/.well-known/openid-configuration` answers, and so does `/auth/v1/health`.
   - `https://api.devdogsuga.org/catalog/v1/` and `/moderation/v1/` answer from the Workers (the catalog contract tests do this).
   - A test account signs in to the platform and, after the products' providers are registered, to both products.
   - The smoke workflow is green ([Smoke checks](./smoke-checks.md)).
7. **Clean up.** Remove the old callback URLs from the four providers, and cancel the custom-domain add-on in the Supabase billing page.

## The issuer

GoTrue's OpenID discovery document reports the **project ref host** (`https://<ref>.supabase.co/auth/v1`) as the issuer, and it did so even while the custom domain was active. A provider must be registered with exactly the issuer discovery reports, so the products register `custom:devdogsuga` against it (`config-push.mjs register` reads it from discovery, never from configuration). Do not expect the issuer to become `devdogsuga.supabase.co`.

After step 2, read `issuer` from the discovery document on `devdogsuga.supabase.co`. If it changed, re-run provider registration for DogDays and DogPack; a mismatch makes every sign-in fail at the token exchange.

## Costs to expect

Everyone is signed out once (the session cookie's name is derived from the host). Members re-run `pnpm devtools oauth` against the new host. Some sign-in screens may show `supabase.co`.

## If something breaks

Before step 5 the whole move can be undone by re-adding the custom hostname (`supabase domains create --custom-hostname api.devdogsuga.org`, then the DNS verification records) - it takes several minutes, during which sign-in stays down. After step 5, fix forward: the routes and the vanity subdomain are independent, so a failure in one does not need the other undone.

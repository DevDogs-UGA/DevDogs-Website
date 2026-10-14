---
name: Deployment
description: The DogDays zone, custom domains, and the one value nothing cross-checks.
order: 10
section: infrastructure
---

# Deployment

Deploys to Cloudflare Workers through vinext, on its own zone, from the officers' [Backstage](https://github.com/DevDogsUGA/Backstage) repository (see [Cloudflare](../../toolkit/infrastructure/cloudflare.md#deploying)), at the DevDogsUGA commit its `devdogsuga.lock` pins. Nothing in this repository deploys. The zone is `dogdays.dev` in
production and `staging.dogdays.dev` in staging, both declared as
`custom_domain` routes in `wrangler.jsonc`.

In-app branding is **DogDays** throughout (mark and copy from
`@devdogsuga/sdk/brand`), with its own light/dark zinc-and-red design driven
by system `prefers-color-scheme` — not the platform's design language.

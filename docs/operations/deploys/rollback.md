---
name: Rolling back
description: Put a Worker back on the version that was serving before, by hand or by letting the deploy do it - and what a rollback cannot undo.
order: 2
section: infrastructure
---

# Rolling back

A Worker rollback is quick and safe: Cloudflare keeps every uploaded version, and switching traffic to an old one changes nothing else. Know the limits at the end before you promise that a rollback fixes things.

## The deploy rolls back by itself

`deploy-worker.yaml` records which version is serving before it does anything. If the smoke test of **what is live** fails after the traffic switch, it deploys the recorded version at 100% and fails the run. The summary says `Rolled back`. You do not need to act, but you do need to find out why.

Both smoke tests first wait up to two minutes for the version to stop answering 5xx (20 good answers in a row) and report that wait as its own line (`the version answers without a 5xx`). Once settled, a page that still answers 5xx is asked once more, and the last line of the summary lists every page that needed it. The platform needs it: for 20 to 40 seconds after a traffic switch, some requests get an empty `503` with `cache-control: no-store`. It is vinext's build-skew guard: the Worker's page-cache stage answers 503 when it runs on a different build than the one that took the request, which happens while edge locations disagree about which version is live. Switching `staging-platform` between two versions under a request loop gave 503 on roughly one request in ten during that window, on both versions, and none outside it; `staging-schedule-builder` showed none, and a version pinned with the override header saw it once while the deployment was still propagating. Real visitors meet the same window on every platform deploy. A line that reads `20 answers in a row after 14 5xx or errored answers first (503 x14), over 31s` is that window, not a fault. A version still answering 5xx at two minutes fails and rolls back.

If the smoke test of the **uploaded version** fails (before any traffic), nothing was ever switched; the version is taken back out of the deployment and the live version carries on.

## Rolling back by hand

Use this when a version passed the smoke tests and is still wrong.

```sh
# From apps/platform (or apps/schedule-builder). List recent versions.
pnpm exec wrangler versions list -e production --name production-platform

# What is serving now, and the version before it.
pnpm exec wrangler deployments list -e production --name production-platform

# Switch traffic to the earlier version.
pnpm exec wrangler versions deploy <version-id>@100% -e production --name production-platform --yes
```

Worker names are `production-platform`, `production-schedule-builder` and `devdogs-slides`. Staging uses the `staging-` prefix. You need the Cloudflare token for that account ([Cloudflare credentials](../credentials/cloudflare.md)). Rolling back is also what the staging rollback drill practises.

## Previewing a version without traffic

The smoke test reaches a new version with the `Cloudflare-Workers-Version-Overrides` header. That header only works for a version that is **in the active deployment**; for one that was merely uploaded, Cloudflare ignores it and the live version answers, so a test of it would pass whatever the new code does. The workflow therefore deploys the new version at 0% beside the live one first. If you test a version by hand, do the same:

```sh
pnpm exec wrangler versions deploy <live-id>@100% <new-id>@0% -e staging --name staging-platform --yes
curl -H 'Cloudflare-Workers-Version-Overrides: staging-platform="<new-id>"' https://staging.devdogsuga.org/
```

## What a rollback does not undo

- **The database.** Migrations and the schema diff are already applied. The old Worker version must work with the new schema; that is why destructive changes ship a deploy after the last code that reads the thing they remove ([Dropping tables](./table-drops.md)). If it cannot, fix forward.
- **Cron triggers and routes.** They follow the config in the checkout that deployed. Run `wrangler triggers deploy` from the older commit if they must change back.
- **Secrets.** A version carries the secrets uploaded with it. Rotating a secret is its own operation ([Credentials](../credentials/index.md)).
- **Durable Object migrations.** The slides relay's migration tag cannot be taken back by a rollback.

## Afterwards

Open an issue naming the bad version and the commit. Do not re-run the same candidate: fix it forward or revert the commit, and let the queue build the new one.

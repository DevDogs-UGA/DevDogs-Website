---
name: One approval per deploy
description: How production asks for approval once per deploy instead of once per job, what it needs from GitHub, how to switch it on and off, and what it changes about destructive SQL, config pushes and unchanged Workers.
order: 8
section: infrastructure
---

# One approval per deploy

A production deploy used to pause at every job that named the `production` environment: the database, the catalog, the platform (DogDays and DogPack: the database and the Worker or the functions). Each pause also blocked the approver from reviewing their own push. The one-approval flow pauses once, after the builds and the database plan, and that approval covers the whole deployment.

It is **off until the repository variable `ONE_APPROVAL` is `true`**. Until then every workflow behaves as before, so nothing here changes a deploy by itself.

## Why it needs a GitHub change

GitHub asks for approval again at every job that names an environment with required reviewers. The ways around that, and why this design:

| Option                                                                                   | Verdict                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `environment: { name: production, deployment: false }` on the later jobs                 | Does not help. GitHub's docs: required reviewers and wait timers still apply with `deployment: false`; it only skips the deployment record.                                                                                                   |
| Fewer, bigger jobs                                                                       | Not enough. The database, each Worker and the functions are separate shared building blocks with their own smoke tests and rollbacks; merging them would lose the independent failure and rollback behaviour, and still pause once per block. |
| A reviewer-less twin of `production` (`production-deploy`) holding copies of the secrets | Works, but environment secrets cannot be read back, so Sloan would have to re-push every production secret and variable with `backstage env push`, for three repositories, and keep two copies in step.                                       |
| **Move the pause to its own environment and make `production` reviewer-less**            | **Chosen.** A new `production-approval` environment holds the reviewers and no secrets. `production` keeps its secrets and loses its reviewers. No secret is copied.                                                                          |

The cost of the chosen design is that `production` is no longer a gate by itself: any job on `main` that names it gets the production secrets. The environment keeps its branch rule (`main` only), `main` is protected (pull requests, the merge queue, required checks), and every production job in these workflows `needs` the approval job. Treat a change to a deploy workflow as a change to production access, and review it so.

## The shape

```
builds -> staging deploy -> production-plan -> production-approval -> database apply -> catalog -> platform
                            (read-only)        (THE pause)             (no pause)       (no pause)
```

- `production-plan` (`plan-database.yaml`) reads the database with the planner credential and writes the migration and schema plans. A destructive plan with no pull request approval fails here, before anyone is asked.
- `production-approval` (`approve-production.yaml`) first writes one summary page, then pauses in `production-approval`. The summary shows, in order: the commit, the **destructive statements** (marked, with the pull request that approved them), the pending migrations and seeds, the schema SQL and its hash, and which Workers and functions the deploy will touch.
- After the approval the self-approval gate runs (the approver neither wrote nor queued the change) and `require_latest` (a commit that is no longer the head of `main` is refused). Both are also checked again by the database apply and by each Worker, against `production-approval`'s approvals.
- `production-database-apply` (`apply-database.yaml`), then the catalog, then the platform, all in `production`.

A rejected approval changes nothing: planning only read. A newer commit merged during the wait supersedes the older run (its waiting `production-approval` job is cancelled by the next push's `supersede` job, and `require_latest` refuses it anyway).

When migrations are pending, the schema diff does not exist yet at approval time: it is computed against the database after the migrations are in. The summary says so; the apply recomputes the diff, writes it to the job summary, and refuses a destructive result the pull request did not approve. With nothing pending (the routine case) the diff is planned before the approval and hash-checked at the apply.

## Things that changed whatever the variable says

- **No destructive environments.** `production-destructive` and `staging-destructive` are no longer used. See [Destructive changes](./destructive-changes.md): the deploy refuses a destructive plan that no pull request approved.
- **The config push is skipped** when neither `supabase/config.toml` nor a seed changed since the tier's last deploy (DevDogsUGA). DogDays and DogPack keep their own `config.toml` rule.
- **Unchanged Workers are skipped** (DevDogsUGA): the platform when every shipped change since the tier's last deploy is under `apps/catalog/`, the catalog when every one is under `apps/platform/` or `docs/`. A skipped Worker shows as an `unchanged` job and counts as current for the next deploy's comparison. Anything else, or anything the comparison cannot work out, deploys both.
- Plan and apply artifacts are named per environment (`plan-schema-production`), so staging and production in one run no longer collide.

## Switching it on

Do these in order. The order matters: the first two steps change nothing, and the last one is what stops `production` asking.

1. **Create the environment `production-approval`** in each repository that deploys to production (DevDogsUGA, DogDays, DogPack): Settings -> Environments -> New environment. Required reviewers: the `devops` team. Prevent self-review: on. Deployment branches: selected branches, `main`. It holds no secrets or variables.
2. **Set the repository variable `ONE_APPROVAL` to `true`** in the same repositories (Settings -> Secrets and variables -> Actions -> Variables). From the next push, production runs the new jobs. `production` still has reviewers at this point, so each job still asks; you have changed the structure, not yet the number of clicks. Run one deploy like this if you want to see the summary first.
3. **Remove the required reviewers from the `production` environment** in the same repositories (Settings -> Environments -> production -> untick Required reviewers). Keep its deployment branch rule (`main`). From now on a production deploy asks once.

If you do step 3 before step 2, `production` is open to every job on `main` with no approval in front of it. Do not.

`backstage github settings` (`desired.ts`) still lists `production` with reviewers and does not know `production-approval`. Do not run it with `--apply` between steps 3 and a commit that updates `desired.ts` to match, or it puts the reviewers back (harmless, the deploy asks more than once again) or reports drift.

To turn it off, delete the variable (or set it to anything but `true`) and put the required reviewers back on `production`. The old per-job flow is untouched.

## DogDays and DogPack

Both call the same shared workflows, pinned by commit SHA, with the same variable and the same environment. Their production jobs are `production-plan`, `production-approval`, `production-database-apply`, then (DogDays) the verify, the legacy copy and the Worker, or (DogPack) the functions. DogDays' staging has no approval and is unchanged.

The DogDays legacy copy (`production-copy`) reads `PLATFORM_DB_URL` from `production`; in the one-approval flow it `needs` the approval like everything else.

## Packages

Stable npm and pub.dev publishes (the `publishing` environment) keep their own approval. A merge that changes both a deploy and a package pauses twice: once for the deploy, once for the publish. Prereleases (`publishing-next`) are unchanged.

## Checking it worked

On the first deploy with the flow on, the run should show exactly one waiting job, named `deploy / production-approval / approve` (DogDays/DogPack: the same without the `deploy /` prefix if they call it directly). After you approve it, no other production job waits. If a later job still waits, the `production` environment still has reviewers (step 3) or a job names a different reviewed environment.

---
name: How a deploy works
description: From a merged pull request to production - what runs, who approves what, and which two shared workflows do the work.
order: 1
section: infrastructure
---

# How a deploy works

Every commit that lands on `main` is built once, deployed to staging automatically, and becomes a production candidate that waits for a human. Read this before your first approval; the other runbooks assume it.

## The path

1. **The merge queue builds the commit.** `ci.yaml` runs on the queue's temporary branch and uploads the staging and production artifacts, each with a `RELEASE_SHA256SUMS` file. The deploy downloads those exact artifacts and verifies the hashes, so what was tested is what ships.
2. **Staging deploys by itself.** The database first, then the platform and catalog Workers.
3. **Production waits.** It runs only when the repository variable `BACKSTAGE_DEPLOYS_PRODUCTION` is `true`, and each production job asks the `production` environment for approval. The catalog Worker deploys first (this commit's platform no longer runs the registrar scrape, so the catalog's Workflows must exist before they ship), then the platform.

## Two shared workflows

The work is done by two reusable workflows in `.github/workflows/`. DogDays and DogPack call the same files, pinned by commit SHA, with their own environments and secrets.

| Workflow               | What it does                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy-database.yaml` | Hand-written migrations, then the declarative diff, then `supabase config push`. Each step is planned, approved and applied against a hash. |
| `deploy-worker.yaml`   | Uploads a Worker version, smoke tests it with no traffic, switches traffic, then smoke tests what is live and rolls back if that fails.     |

The slides deck deploys through `deploy-worker.yaml` too, from `slides.yaml`.

## What an approval means

Approving a production job approves **the plan you can read in the run's summary**, not "whatever is on `main`":

- The database job writes the SQL and its SHA-256 into the summary. The apply job regenerates the SQL against the real database and refuses, changing nothing, if the hash is different.
- The approval gate refuses you if you wrote the change or queued it. This is checked by the workflow, not just by GitHub.
- A candidate that is no longer the head of `main` refuses to deploy. A newer commit has its own run; approve that one. The exception is a workflow that runs only on some paths (Slides): a newer commit that does not touch its paths has no run of its own, so the approved candidate still deploys, and only a newer commit that does touch them supersedes it (`latest_paths` in `slides.yaml`, `.github/scripts/superseded.mjs`).

Production asks twice in a normal deploy: once for the database, then once for both Workers together. A plan that drops or rewrites data asks a third time, of `production-destructive` ([Destructive changes](./destructive-changes.md)).

<details>
<summary>Why are the Worker steps in one job?</summary>

An environment with required reviewers asks for approval once per job. The upload, both smoke tests and the switch share a job so a reviewer approves the commit once, not three times. The catalog is a job of its own that runs before the platform, so it is a second click.

</details>

## When a deploy needs the full mode

A version upload cannot apply a **Durable Object migration** or a **new queue consumer**, and cannot create a Worker that does not exist yet. For the one deploy that changes one of those, set the repository variable `WORKER_DEPLOY_MODE` to `full`. The Workers then deploy the classic way (no 0% preview; the live smoke test still runs and still rolls back on failure). Delete the variable straight after: left set, every deploy skips the preview.

## When something goes wrong

- A red staging run is information, not an emergency. Production does not start until staging succeeds.
- A red production database job: [A failed migration](./failed-migration.md).
- A red production Worker job: [Rolling back](./rollback.md).
- Sign-in broken for members: [Sign-in is down](../incidents/sign-in-down.md).

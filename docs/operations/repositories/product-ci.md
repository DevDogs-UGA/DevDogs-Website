---
name: Product repository CI
description: The two workflow files DogDays and DogPack need so the destructive gate reports the check names their rulesets require, and how to pin the shared workflows.
order: 4
section: infrastructure
---

# Product repository CI

DogDays and DogPack reuse DevDogsUGA's workflows for the database checks and the deploys. A reusable workflow's jobs report to GitHub as **`<caller job> / <called job>`**, so the check names a ruleset requires depend on how the product names its caller jobs. Get the names wrong and `main-ci` waits for a check nobody reports, which blocks every pull request. The names the rulesets require are fixed in `PRODUCT_REQUIRED_CHECKS` (`packages/backstage/src/github/rulesets/desired.ts`):

| Required check                        | Reported by                                                                |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `validate`, `database`                | the product's own CI jobs (and `flutter` for DogPack)                      |
| `destructive-gate / destructive-sql`  | `database-pr.yaml`, called from a caller job named `destructive-gate`      |
| `destructive-gate / destructive-gate` | `destructive-gate.yaml` on a pull request, `database-pr.yaml` on the queue |

Both caller jobs are called `destructive-gate` on purpose: the merge queue has no `pull_request_target` event, so the queue's copy of the gate comes from `database-pr.yaml` and must carry the same name as the pull request's.

## The two workflow files

Pin every `uses:` line to a **commit SHA** of DevDogsUGA, and pass the same SHA as `shared_ref` so the scripts come from the same commit.

`.github/workflows/database.yaml` (pull requests and the merge queue):

```yaml
name: Database
on:
  pull_request:
    types: [opened, reopened, synchronize, labeled, unlabeled]
  merge_group:
permissions:
  contents: read
  pull-requests: read
  issues: read
jobs:
  destructive-gate:
    uses: DevDogsUGA/DevDogsUGA/.github/workflows/database-pr.yaml@<sha>
    with:
      shared_ref: <sha>
```

`.github/workflows/destructive-gate.yaml` (who applied the label):

```yaml
name: Destructive gate
on:
  pull_request_target:
    types: [opened, reopened, synchronize, labeled, unlabeled]
permissions:
  contents: read
  pull-requests: write
  issues: write
jobs:
  destructive-gate:
    uses: DevDogsUGA/DevDogsUGA/.github/workflows/destructive-gate.yaml@<sha>
    with:
      shared_ref: <sha>
```

The second file runs on `pull_request_target`, so it must never check out or run the pull request's code. The shared workflow takes its script from the base branch and the pinned commit and reads nothing but the pull request number.

## Before applying the product ruleset

1. Create the `allow-destructive` label in the repository.
2. Merge both files, open a throwaway pull request, and look at the check names it reports. They must read exactly as in the table.
3. Only then run `pnpm backstage github rulesets --repo <name> --apply`.

The deploy workflows (`deploy-database.yaml`, `deploy-worker.yaml`) are called the same way, from the product's own deploy workflow, pinned by SHA. See [how a deploy works](../deploys/how-a-deploy-works.md).

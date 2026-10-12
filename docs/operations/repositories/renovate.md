---
name: Renovate
description: What the shared Renovate preset updates, when, what merges by itself, what waits for an officer, and how to turn it on or hold it back.
order: 2
section: infrastructure
---

# Renovate

One shared preset, `renovate/default.json` in DevDogsUGA, configures Renovate for all three repositories. Each repository's own `renovate.json5` extends it: `github>DevDogsUGA/DevDogsUGA//renovate/default`. Renovate's vulnerability alerts replace Dependabot security updates, which are switched off.

## What it does

- **Covers** npm, pub.dev, GitHub Actions (pinned to digests) and the **Supabase CLI pin**.
- **One grouped pull request per repository, on weekends**, for patch and minor updates. They enter the merge queue by auto-merge once the required checks pass.
- **Majors** arrive one at a time, on any day, labelled `needs-officer`, and are never merged automatically.
- **`@devdogsuga/*` and `devdogsuga_sdk`** bump as soon as they publish and merge by themselves in the product repositories; there is no release-age wait for our own packages.
- **Vulnerability alerts** open at any time with the `security` label, and are never held back by the age gate. They do not auto-merge: read them.
- Commits are signed through GitHub's API, so they satisfy the [signed-commits rule](./rulesets.md).

## The Supabase CLI is special

The CLI version is pinned in three places that must agree: the pnpm catalog, the root `devDependencies`, and the `supabase_version` default in `deploy-database.yaml`. A new CLI can change the SQL the declarative diff writes and the schema hash the generated types are keyed by, so a bump is one grouped pull request, labelled `supabase-cli` and `needs-officer`, never auto-merged. Before merging it, run the pull request check and look at the diff the new CLI writes for the same tree: it should be empty.

## Turning it on

DevDogsUGA's `renovate.json5` ships with a rollout switch: the first package rule disables everything except our own packages, so merging the preset changes nothing until you are ready. To turn Renovate on for the repository, delete that rule (and its comment) in a pull request. For a product repository, extend the preset with no switch.

Renovate itself is a GitHub App installed by an organization owner; an owner also chooses which repositories it can see ([Owner-only actions](./owner-actions.md)).

## Holding it back

- One repository, briefly: comment on the Dependency Dashboard issue, or close the pull request (Renovate leaves it closed).
- One package: add a `packageRules` entry with `enabled: false` and a comment that says why and until when.
- Everything, in an incident: set `"enabled": false` at the top level of that repository's `renovate.json5`.

## Checking a change to the preset

```sh
npx --yes --package renovate renovate-config-validator --strict renovate/default.json
```

Validate before you merge: a preset that fails validation takes Renovate down in **every** repository at once.

---
name: Rulesets and signed commits
description: The branch rules on DevDogsUGA, DogDays and DogPack - signed commits, merge queue, squash only - how to preview and apply them, and how to set up a signing key.
order: 1
section: infrastructure
---

# Rulesets and signed commits

All three repositories carry the same shape of rules on `main`: **signed commits**, a **merge queue**, **squash merges only**, one code-owner review, and the required checks including the [destructive gate](../deploys/destructive-changes.md). The rules are code, in `packages/backstage/src/github/rulesets/`, and applying them is a deliberate step by an organization admin.

## Preview, then apply

```sh
# The diff between the code and GitHub, for all three repositories. Read-only.
pnpm backstage github rulesets --repo all

# One repository at a time. --apply asks you to confirm; it is never run unattended.
pnpm backstage github rulesets --repo DevDogsUGA --apply
```

The output is a diff: `+ create`, `~ update` with the rules and checks added (`+`) and removed (`-`), `= ok` for what already matches. A repository that does not exist yet (DogDays and DogPack before they are created) shows every ruleset as a create, and `--apply` refuses until it exists.

The merge queue ruleset is withheld until the repository's `ci.yaml` has a `merge_group` trigger. Without it a queued pull request waits forever for a check that never starts.

**Order matters.** `main-ci` requires the checks `destructive-sql` and `destructive-gate`, which are reported by `database-pr.yaml` and `destructive-gate.yaml`. Apply the ruleset only **after** those workflows are on `main`: a required check that no workflow reports blocks every pull request. The same goes for a product repository: its CI must report the job names in `PRODUCT_REQUIRED_CHECKS` (`packages/backstage/src/github/rulesets/desired.ts`) before its `main-ci` is applied.

## What each ruleset does

| Ruleset            | Purpose                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `main-integrity`   | No deleting or force-pushing `main`, and **signed commits only**. No bypass for anyone.                                                          |
| `main-reviews`     | Pull requests only; squash only; one code-owner approval; threads resolved. Admins bypass; Renovate may open its own pull requests but not push. |
| `main-ci`          | Required checks: `validate`, `database`, `toolchain`/`flutter` as the repository has them, `destructive-sql` and `destructive-gate`.             |
| `main-merge-queue` | Squash, up to five entries built and merged together, all checks green.                                                                          |

A bypass actor bypasses **every** rule in its ruleset, which is why they are split: letting admins push directly past the review rule must not also let them force-push.

## Signed commits

Merges made by the merge queue are signed by GitHub. A **direct push** to `main` (an admin, in an emergency) needs the pusher's own signing key, or it is refused. Set yours up before you need it:

1. Create an SSH signing key: `ssh-keygen -t ed25519 -C "you@example.org" -f ~/.ssh/id_signing`.
2. Add the public key on GitHub under **Settings, SSH and GPG keys**, as a **Signing Key** (not an authentication key).
3. Tell git: `git config --global gpg.format ssh`, `git config --global user.signingkey ~/.ssh/id_signing.pub`, `git config --global commit.gpgsign true`.
4. Push a commit anywhere and confirm GitHub shows **Verified**.

Renovate signs its commits through GitHub's API (`platformCommit` in the shared preset), so its pull requests pass.

## When a check name changes

The required checks are matched by **job name**. Renaming a job in a workflow silently removes it from the requirement - and a required check no workflow reports blocks every pull request. Change the name in `desired.ts`, run the preview, and apply the ruleset in the same sitting as the merge.

## Applying is an organization action

Applying a ruleset is an admin action (owner or the `admins` team). The rest of the day-to-day does not need it. See [Owner-only actions](./owner-actions.md).

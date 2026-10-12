---
name: Bitwarden
description: The vault that is the source of truth for every secret - owner, admins, how machine access works, and recovery when the vault itself is the problem.
order: 9
section: infrastructure
---

# Bitwarden

## Owner and admins

- **Owner:** the DevOps/Platform officer administers the club's Bitwarden organization.
- **Admins:** the President and the Vice President are organization owners. A vault with one owner is a vault the club can lose.

## What it holds

Bitwarden **Secrets Manager** has three projects, one per target: `preflight`, `staging` and `production`. Each holds the secrets for that target; `backstage env pull` writes a local env file from it, and `backstage env push` copies it into the matching GitHub environment. The GitHub copy is derived: if the two disagree, Bitwarden wins and the next push repairs GitHub.

The newsletter mailbox login and the club's shared logins live in the regular vault in a collection the officers share.

## Who can read what

Production secrets are readable by the officers who deploy, not by every `devops` approver. Approving a deploy needs no secret: the approver reads a plan, not a credential. Give access to the `production` project only to people who will rotate things.

## Rotating the access itself

- **A person's access:** remove them from the organization and from the Secrets Manager projects, then rotate anything they could read ([the rotation routine](./index.md)).
- **A machine access token:** create the new token in Secrets Manager, replace it wherever it is used (an officer's laptop; CI never holds it, because CI reads the derived GitHub copy), delete the old one.
- **The master password:** change it from the account settings; the recovery codes are printed and kept by the President with the club's other recovery material.

## Recovery

- **Locked out:** use the account's recovery codes. If an owner is locked out, another owner resets the member.
- **The vault is unavailable during an incident:** deploys still work, because the GitHub environments hold their own copy. You lose the ability to _change_ a secret until the vault is back.
- **A secret exists in GitHub but not Bitwarden:** run `pnpm backstage env audit --target production` to list the mismatch, then put the value in Bitwarden so the next push does not erase it.

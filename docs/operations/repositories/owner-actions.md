---
name: Owner-only actions
description: The GitHub organization actions only an owner can take, who the owners are, and how an officer asks for one.
order: 3
section: infrastructure
---

# Owner-only actions

Some changes need a GitHub organization **owner**. The owners are the **President** and the **Vice President** (a backup, for now). Nobody else holds the role, on purpose: owners can delete the organization, so there are two, and both are named in the club's succession notes.

## What only an owner can do

- Apply or change rulesets, organization-wide settings, and the 2FA requirement.
- Install, configure or remove a GitHub App (the platform App, Renovate), and choose which repositories it sees.
- Create or delete repositories, transfer them, or change their visibility.
- Add and remove organization owners, and change member permissions.
- Create organization-level secrets, variables and webhooks.
- Change the `devops`, `admins`, `focus-leads` and `reviewers` team structure above what the platform's team sync manages.
- Archive a repository.

## What a `devops` member can do without an owner

- Approve production deploys and the destructive gate.
- Apply the `allow-destructive` label.
- Edit environments' secrets and variables on the repositories where they hold `maintain`.
- Run the read-only previews: `pnpm backstage github rulesets --repo all`, `pnpm backstage github settings`.

## How the officer asks for one

Open a pull request or an issue that says exactly what to run, and for what. Prefer a command the owner can paste over a screenshot of a settings page:

> Please run `pnpm backstage github rulesets --repo DogDays --apply` once the repository exists. The preview output is attached.

The owner reads the preview, runs it, and replies with the result. For anything that has no command, write the settings-page path and the value.

## Why it is this way

An organization owner can undo any control we build. Keeping the role to two people means the controls hold even if an officer's account is compromised, and the [credentials](../credentials/github.md) page says how to recover if both owners are unreachable.

---
name: npm and pub.dev
description: The package registries - Trusted Publishing so there is no long-lived token, who owns the npm organization and the pub.dev publisher, and what to do when publishing stops.
order: 6
section: infrastructure
---

# npm and pub.dev

## Owner and admins

- **Owner:** the DevOps/Platform officer.
- **npm:** the `@devdogsuga` organization. Owners are the President and the Vice President; the officer is a member with publish rights.
- **pub.dev:** a verified publisher for `devdogsuga.org`, proved by a DNS record in the club's zone. Its admins are the same people.

## What it issues

There is **no long-lived publish token** to rotate. Both registries trust a specific GitHub workflow:

- **npm Trusted Publishing**, per package: the package's settings name the repository and the workflow file `ci.yaml`, with two trusted publishers, one per environment: `publishing` for stable releases and `publishing-next` for `next` prereleases. `ci.yaml` is the workflow that calls `publish.yaml`, and npm checks the calling workflow's filename. The environment is never left blank: a blank one would accept a publish from any `ci.yaml` run on any ref, skipping the `publishing` approval. The workflow gets a short-lived credential from GitHub for each publish.
- **pub.dev automated publishing**, per package: the package's admin page names the repository and the tag pattern. Only a tag push from that repository can publish.

The VS Code extension is the exception: the Marketplace uses a personal access token (`VSCE_PAT`) held as a repository secret.

## The two environments

Prereleases publish from `publishing-next`, which has no reviewers and runs from `main` only. Stable releases publish from `publishing`, which needs a `devops` approver ([npm and pub.dev releases](../releases/publishing.md)).

## Rotating and recovering

- **`VSCE_PAT`:** create a new token in the publisher's Azure DevOps organization with _Marketplace (Manage)_, replace the secret, publish once, delete the old token.
- **Re-pointing Trusted Publishing** (repository renamed, workflow renamed): change it on each package's settings page. A missed package fails its own publish and only that one.
- **Publishing fails with 403 or "no trusted publisher":** the workflow file, repository or environment name differs from what the package trusts. Compare the three, character for character.
- **Lost the npm owner login:** an organization owner adds another owner, then removes the lost one. Without a second owner there is no recovery except npm support: keep two.
- **A bad release is published:** deprecate it (`npm deprecate`) rather than unpublish, and publish a fixed version. pub.dev versions can be retracted but never deleted.

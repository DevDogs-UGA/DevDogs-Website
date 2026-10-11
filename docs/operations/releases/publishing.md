---
name: npm and pub.dev releases
description: How packages reach npm and pub.dev - prereleases that flow freely, stable releases that wait for a devops approval - and how to cut, check and take back a release.
order: 1
section: infrastructure
---

# npm and pub.dev releases

Two kinds of release, with two different gates.

| Kind       | Where it publishes from                             | Who approves                                  | Tag                                                  |
| ---------- | --------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| Prerelease | The `publishing-next` environment, from `main` only | Nobody; it has no reviewers                   | npm dist-tag `next`; a prerelease version on pub.dev |
| Stable     | The `publishing` environment                        | A `devops` member who did not push the commit | npm `latest`; a normal version on pub.dev            |

The product repositories depend on the **prereleases**, so a change to the SDK reaches them as soon as it merges, and CI there tests against real published packages. Renovate then proposes the stable bump ([Renovate](../repositories/renovate.md)). The stable gate is the one that matters: a stable version is what members install.

## Cutting a release

1. Merge the change to `main`. The publish workflow plans which packages changed, builds **immutable artifacts**, records their hashes, and uploads them.
2. A prerelease publishes by itself. For stable, the `publish` job waits for approval of `publishing`; the run summary lists the packages and versions it will publish and the artifact hashes. Approve it only if you recognise them.
3. The publish job verifies the hashes, then publishes the **exact artifacts** it was shown. A candidate cannot change between approval and publish.

Stable publishing from this repository stays off until the repository variable `BACKSTAGE_PUBLISHES_STABLE` is `true`; until then only prereleases flow.

## Checking a release

```sh
npm view @devdogsuga/sdk dist-tags
npm view @devdogsuga/sdk@next version
```

For pub.dev, the package page lists versions and marks the latest stable. For a package consumed by a product, install it in a scratch directory and import the one thing that changed; a published package that builds in the monorepo can still be missing a file from its `files` list.

## Taking a bad release back

- **npm:** do not unpublish a version others may have installed. Move the tag and deprecate it:

  ```sh
  npm dist-tag add @devdogsuga/sdk@<good-version> latest
  npm deprecate @devdogsuga/sdk@<bad-version> "Broken: use <good-version>"
  ```

  Publishing needs Trusted Publishing, so these commands need an npm login with publish rights.

- **pub.dev:** retract the version from the package's _Admin_ page; consumers stop resolving to it. Versions cannot be deleted.
- Then publish a fixed version through the normal path, and tell the product repositories if they had already taken the bad one.

## The first publish of a new package

Trusted Publishing is configured on an existing package, so it cannot mint the first version. The first version of each npm package and each pub.dev package is published **by hand** by an owner, and Trusted Publishing is configured immediately afterwards ([npm and pub.dev](../credentials/registries.md)). The pub.dev verified publisher needs `devdogsuga.org` verified first.

/**
 * `devtools-ci` and `devtools-ci-bare`: deprecated bins that forward to
 * `@devdogsuga/backstage`'s code, bundled into this package, until the
 * DevDogsUGA cutover moves its workflows to `backstage`. See backstage's
 * `ci-alias.ts` for what they do and how they differ from it.
 */
export { launchCi, launchCiBare } from "@devdogsuga/backstage/ci-alias";

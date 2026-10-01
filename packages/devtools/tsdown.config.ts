import { readFileSync } from "node:fs";
import { defineConfig } from "tsdown";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/**
 * Bundles the CLI into a flat `dist/`, inlining `@devdogsuga/cli-core` (the
 * private shared core, a `workspace:*` devDependency) and, until the cutover,
 * backstage's `devtools-ci` alias entry, and nothing else: every
 * other import stays external and must be declared in this package's
 * `dependencies`/`peerDependencies`. The build fails (`onlyBundle`) if
 * anything from `node_modules` is inlined, and (`onlyImport`) if the output
 * imports a package this manifest does not declare.
 *
 * The entries are the ones the bins and the runtime load by file name:
 * `launch`/`launch-ci` (the bins), `telemetry` (the bins' crash report),
 * and `peer-redirect-hooks`, which Node loads by path through
 * `module.register` (see cli-core's `repo/peer-redirect.ts`). Everything else
 * is a shared chunk beside them, so `import.meta.url` of any module still
 * sits one level under the package root, which `version.ts` and
 * `telemetry.ts` rely on.
 */
export default defineConfig({
  entry: {
    launch: "src/launch.ts",
    "launch-ci": "src/launch-ci.ts",
    telemetry: "../cli-core/src/telemetry.ts",
    "peer-redirect-hooks": "../cli-core/src/repo/peer-redirect-hooks.ts",
  },
  format: "esm",
  platform: "node",
  target: "node22",
  // `.js`, not tsdown's `.mjs`: the bins and `module.register` load these by
  // name, and the package is already `"type": "module"`.
  outExtensions: () => ({ js: ".js" }),
  clean: true,
  dts: false,
  sourcemap: false,
  // The core resolves its own imports from its own node_modules; devtools
  // declares the same packages, so the same names stay external.
  deps: {
    alwaysBundle: [
      /^@devdogsuga\/cli-core(\/|$)/,
      // The deprecated `devtools-ci` aliases run backstage's code (see
      // `src/launch-ci.ts`); until the cutover removes them, it is bundled in
      // exactly like the core.
      /^@devdogsuga\/backstage\/ci-alias$/,
    ],
    onlyBundle: [],
    onlyImport: [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ],
  },
});

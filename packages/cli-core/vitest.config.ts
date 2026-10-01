import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

// This checkout is not a DevDogsUGA clone, so `findRepoRoot()`
// (src/repo/root.ts) would throw for every test that touches a repo-relative
// path. A handful of tests (workers.ts's `workers.json` read, env/discovery's
// `apps`/`packages` scan) need SOMETHING real on disk at that path, not just
// a string: this minimal, mostly-empty directory is the stand-in (a
// `workers.json` and empty `apps`/`packages` dirs, nothing else). Everything
// else that touches a repo-relative path mocks the filesystem call that would
// read it. `src/repo/peers.ts` treats the same var as "skip repo resolution,
// import the real Backstage package" for `@devdogsuga/*` peers. A test that
// wants the genuine "not in a repo" refusal unsets it locally. devtools' own
// config points at this same directory.
const repoRootFixture = fileURLToPath(
  new URL("./test-fixtures/repo-root", import.meta.url),
);

export default mergeConfig(
  nodePreset,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts"],
      env: { DEVTOOLS_TEST_REPO_ROOT: repoRootFixture },
    },
  }),
);

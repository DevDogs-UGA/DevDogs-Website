import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

// Backstage's own checkout is not a DevDogsUGA clone, so `findRepoRoot()`
// (src/repo/root.ts) would throw for every test that touches a
// repo-relative path. A handful of tests (workers.ts's `workers.json` read,
// env/discovery.ts's `apps`/`packages` scan) need SOMETHING real on disk at
// that path, not just a string — this fixture directory is a minimal,
// mostly-empty stand-in (see test-fixtures/repo-root/ — a `workers.json`
// and empty `apps`/`packages` dirs, nothing else). Everything else that
// touches a repo-relative path in tests mocks the filesystem call that
// would actually read it, so the fixture's emptiness never matters there.
// `src/repo/peers.ts` treats the same var as "skip repo resolution, import
// the real Backstage package" for `@devdogsuga/*` peers. A test that wants
// the genuine "not in a repo" refusal unsets it locally.
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

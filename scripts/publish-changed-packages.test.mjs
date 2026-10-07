// Layering and concurrency of the publish script. Run with
// `pnpm check:publish`. No network, no npm: the graph and the layer runner
// are pure, and the runner is driven with fake jobs.
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  canonical,
  contentHashOfPackageDir,
  publishEdges,
  publishLayers,
  runLayers,
} from "./publish-changed-packages.mjs";

const pkg = (name, fields = {}) => ({ json: { name, ...fields } });
const names = (layers) => layers.map((layer) => layer.map((p) => p.json.name));

test("dependencies and workspace peers are edges; devDependencies are not", () => {
  const a = pkg("a");
  const b = pkg("b");
  const c = pkg("c");
  const d = pkg("d");
  const byName = new Map([a, b, c, d].map((p) => [p.json.name, p]));
  const user = pkg("user", {
    dependencies: { a: "workspace:*", external: "^1.0.0" },
    optionalDependencies: { b: "workspace:*" },
    peerDependencies: { c: "workspace:*", d: "*" },
    devDependencies: { d: "workspace:*" },
  });
  assert.deepEqual(publishEdges(user, byName), ["a", "b", "c"]);
});

test("a devDependency alone does not push a package into a later layer", () => {
  const layers = publishLayers([
    pkg("lib"),
    pkg("tool", { devDependencies: { lib: "workspace:*" } }),
  ]);
  assert.deepEqual(names(layers), [["lib", "tool"]]);
});

test("a dependent lands one layer past its deepest dependency", () => {
  const layers = publishLayers([
    pkg("cli", {
      dependencies: { mid: "workspace:*", leaf: "workspace:*" },
    }),
    pkg("mid", { dependencies: { leaf: "workspace:*" } }),
    pkg("leaf"),
    pkg("other"),
  ]);
  assert.deepEqual(names(layers), [["leaf", "other"], ["mid"], ["cli"]]);
});

test("cycles are rejected with the path", () => {
  assert.throws(
    () =>
      publishLayers([
        pkg("a", { dependencies: { b: "workspace:*" } }),
        pkg("b", { dependencies: { a: "workspace:*" } }),
      ]),
    /Circular workspace dependency: a -> b -> a/,
  );
});

test("the repo's own public packages layer cleanly, and the officer CLIs stay unpublished", () => {
  const dir = join(import.meta.dirname, "..", "packages");
  const all = readdirSync(dir)
    .filter((name) => existsSync(join(dir, name, "package.json")))
    .map((name) =>
      JSON.parse(readFileSync(join(dir, name, "package.json"), "utf8")),
    );
  // TASK-478 Phase 3: officers run these from a Backstage clone and DevDogsUGA
  // no longer depends on them, so they must not reach npm.
  for (const name of [
    "@devdogsuga/backstage",
    "@devdogsuga/events",
    "@devdogsuga/newsletter",
  ]) {
    assert.equal(
      all.find((json) => json.name === name)?.private,
      true,
      `${name} must stay private`,
    );
  }
  const pkgs = all
    .filter((json) => json.private !== true)
    .map((json) => ({ json }));
  const layers = names(publishLayers(pkgs));
  const layerOf = (name) => layers.findIndex((l) => l.includes(name));
  assert.equal(
    layerOf("@devdogsuga/devtools"),
    0,
    "devtools inlines telemetry",
  );
});

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("jobs in a layer run together; the next layer waits for all of them", async () => {
  const events = [];
  const layers = [[pkg("a"), pkg("b")], [pkg("c")]];
  await runLayers(layers, {
    label: (p) => p.json.name,
    run: async (p) => {
      events.push(`start ${p.json.name}`);
      await tick(p.json.name === "a" ? 30 : 5);
      events.push(`end ${p.json.name}`);
    },
  });
  assert.deepEqual(events, [
    "start a",
    "start b",
    "end b",
    "end a",
    "start c",
    "end c",
  ]);
});

test("a failure stops the next layer and reports what completed", async () => {
  const started = [];
  const layers = [[pkg("a"), pkg("b")], [pkg("c")]];
  await assert.rejects(
    runLayers(layers, {
      label: (p) => p.json.name,
      run: async (p) => {
        started.push(p.json.name);
        await tick(5);
        if (p.json.name === "b") throw new Error("boom");
      },
    }),
    (err) => {
      assert.match(err.message, /Layer 0 failed: b \(boom\)/);
      assert.match(err.message, /Completed before stopping \(1\): a\./);
      assert.match(err.message, /Not started \(1\): c\./);
      return true;
    },
  );
  assert.deepEqual(started, ["a", "b"]);
});

test("prepare runs alone before each layer's jobs", async () => {
  const events = [];
  await runLayers([[pkg("a")], [pkg("b")]], {
    label: (p) => p.json.name,
    prepare: (layer, index) => {
      events.push(`prepare ${index}`);
      return layer;
    },
    run: async (p) => {
      events.push(`run ${p.json.name}`);
    },
  });
  assert.deepEqual(events, ["prepare 0", "run a", "prepare 1", "run b"]);
});

// --- content comparison ----------------------------------------------------

/** A package directory with this package.json and one dist file. */
function packageDir(json, dist = "export {};\n") {
  const dir = mkdtempSync(join(tmpdir(), "publish-test-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify(json, null, 2));
  mkdirSync(join(dir, "dist"));
  writeFileSync(join(dir, "dist", "index.js"), dist);
  return dir;
}

test("canonical sorts keys at every depth and keeps array order", () => {
  assert.deepEqual(
    JSON.stringify(canonical({ b: 1, a: { d: [2, 1], c: 0 } })),
    JSON.stringify({ a: { c: 0, d: [2, 1] }, b: 1 }),
  );
});

test("contentHashOfPackageDir ignores the version and dependency order", () => {
  const a = packageDir({
    name: "x",
    version: "0.1.49",
    devDependencies: {
      "@devdogsuga/config": "0.1.3",
      "@devdogsuga/cli-core": "0.0.0",
    },
  });
  const b = packageDir({
    name: "x",
    version: "0.1.50",
    devDependencies: {
      "@devdogsuga/cli-core": "0.0.0",
      "@devdogsuga/config": "0.1.3",
    },
  });
  assert.equal(contentHashOfPackageDir(a), contentHashOfPackageDir(b));
});

test("contentHashOfPackageDir sees a changed file or dependency", () => {
  const base = { name: "x", version: "1.0.0", dependencies: { y: "1.0.0" } };
  const hash = contentHashOfPackageDir(packageDir(base));
  assert.notEqual(
    hash,
    contentHashOfPackageDir(packageDir(base, "export const changed = 1;\n")),
  );
  assert.notEqual(
    hash,
    contentHashOfPackageDir(
      packageDir({ ...base, dependencies: { y: "1.0.1" } }),
    ),
  );
});

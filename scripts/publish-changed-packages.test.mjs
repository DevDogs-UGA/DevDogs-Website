// Layering and concurrency of the publish script. Run with
// `pnpm check:publish`. No network, no npm: the graph and the layer runner
// are pure, and the runner is driven with fake jobs.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
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

test("the repo's own packages layer with newsletter before backstage", () => {
  const dir = join(import.meta.dirname, "..", "packages");
  const pkgs = readdirSync(dir)
    .filter((name) => existsSync(join(dir, name, "package.json")))
    .map((name) =>
      JSON.parse(readFileSync(join(dir, name, "package.json"), "utf8")),
    )
    .filter((json) => json.private !== true)
    .map((json) => ({ json }));
  const layers = names(publishLayers(pkgs));
  const layerOf = (name) => layers.findIndex((l) => l.includes(name));
  assert.ok(
    layerOf("@devdogsuga/newsletter") < layerOf("@devdogsuga/backstage"),
  );
  assert.ok(layerOf("@devdogsuga/events") < layerOf("@devdogsuga/newsletter"));
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

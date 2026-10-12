import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  deprecationFor,
  OLD_PACKAGES,
  SDK_SUBPATHS,
} from "./deprecate-old-packages.mjs";

const sdkManifest = new URL("../packages/sdk/package.json", import.meta.url);
const exportsMap = JSON.parse(readFileSync(sdkManifest, "utf8")).exports;

test("every deprecation message points at a subpath the sdk exports", () => {
  for (const name of OLD_PACKAGES) {
    const { message, spec } = deprecationFor(name);
    assert.equal(spec, `@devdogsuga/${name}@*`);
    for (const path of SDK_SUBPATHS[name]) {
      assert.ok(
        `./${path}` in exportsMap,
        `@devdogsuga/sdk has no ./${path} export`,
      );
      assert.ok(message.includes(`"@devdogsuga/sdk/${path}"`), message);
    }
  }
});

test("db is three subpaths, not a nonexistent sdk/db", () => {
  assert.ok(!("./db" in exportsMap));
  assert.deepEqual(SDK_SUBPATHS.db, ["db/client", "db/server", "db/typegen"]);
});

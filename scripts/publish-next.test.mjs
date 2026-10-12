import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  highestStable,
  isNextVersion,
  nextVersionFor,
  patchBump,
  prepare,
  publishPlan,
  registryState,
} from "./publish-next.mjs";

describe("versions", () => {
  it("ignores prereleases when finding the highest stable version", () => {
    assert.equal(
      highestStable([
        "0.1.2",
        "0.1.10",
        "0.1.11-next.3",
        "0.2.0-next.1",
        "0.1.9",
      ]),
      "0.1.10",
    );
    assert.equal(highestStable(["0.1.0-next.1"]), null);
  });

  it("leads to the next patch: one past stable, then -next.<build>", () => {
    assert.equal(
      nextVersionFor({
        stableVersions: ["0.1.18", "0.1.19"],
        committedVersion: "0.1.0",
        build: 345,
      }),
      "0.1.20-next.345",
    );
  });

  it("uses the committed version when nothing stable is out", () => {
    assert.equal(
      nextVersionFor({
        stableVersions: [],
        committedVersion: "0.1.0",
        build: "7",
      }),
      "0.1.0-next.7",
    );
  });

  it("refuses a build number that is not an integer", () => {
    assert.throws(() =>
      nextVersionFor({
        stableVersions: [],
        committedVersion: "0.1.0",
        build: "abc",
      }),
    );
  });

  it("only bumps plain versions", () => {
    assert.equal(patchBump("1.2.3"), "1.2.4");
    assert.throws(() => patchBump("1.2.3-next.1"));
  });

  it("recognises what it would publish", () => {
    assert.equal(isNextVersion("0.1.20-next.345"), true);
    assert.equal(isNextVersion("0.1.20"), false);
    assert.equal(isNextVersion("0.1.20-beta.1"), false);
  });
});

describe("registryState", () => {
  const packument = {
    versions: {
      "0.1.18": {},
      "0.1.19": {},
      "0.1.20-next.5": { dist: { shasum: "abc", tarball: "https://t/x.tgz" } },
    },
    "dist-tags": { latest: "0.1.19", next: "0.1.20-next.5" },
  };

  it("separates the stable versions from the live next", async () => {
    assert.deepEqual(await registryState("p", async () => packument), {
      stableVersions: ["0.1.18", "0.1.19"],
      next: {
        version: "0.1.20-next.5",
        shasum: "abc",
        tarball: "https://t/x.tgz",
      },
    });
  });

  it("treats an unpublished package as empty", async () => {
    assert.deepEqual(await registryState("p", async () => null), {
      stableVersions: [],
      next: null,
    });
  });
});

/** Two packages, `lib` and `cli` (which depends on lib), as real package.json files. */
function workspace() {
  const root = mkdtempSync(join(tmpdir(), "publish-next-test-"));
  const make = (name, extra = {}) => {
    const dir = join(root, name.replace("@x/", ""));
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "package.json");
    const json = { name, version: "0.1.0", ...extra };
    writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
    return { path, json };
  };
  const lib = make("@x/lib");
  const cli = make("@x/cli", { dependencies: { "@x/lib": "workspace:*" } });
  return { root, pkgs: [cli, lib], lib, cli };
}

/** A fake pack: the "tarball" is the package's name, version and the version of lib it was packed against. */
function fakeDeps({ root, pkgs, registry, same }) {
  const packs = [];
  return {
    packs,
    deps: {
      state: async (name) =>
        registry[name] ?? { stableVersions: [], next: null },
      commit: () => "abc123",
      pack: (name, dest) => {
        const pkg = pkgs.find((p) => p.json.name === name);
        const onDisk = JSON.parse(readFileSync(pkg.path, "utf8"));
        const lib = JSON.parse(
          readFileSync(pkgs.find((p) => p.json.name === "@x/lib").path, "utf8"),
        );
        const file = join(dest, `${packs.length}.tgz`);
        writeFileSync(
          file,
          `${name}@${onDisk.version} lib=${name === "@x/cli" ? lib.version : "-"}`,
        );
        packs.push({ name, version: onDisk.version });
        return file;
      },
      sameAsLive: async (live, tarball) =>
        same(live, readFileSync(tarball, "utf8")),
    },
    root,
  };
}

describe("prepare", () => {
  it("publishes both packages the first time, dependency first", async () => {
    const w = workspace();
    const { deps } = fakeDeps({ ...w, registry: {}, same: () => false });
    const plan = await prepare({
      pkgs: w.pkgs,
      outDir: join(w.root, "out"),
      build: 9,
      deps,
    });
    assert.deepEqual(
      plan.packages.map((p) => [p.name, p.layer, p.action, p.version]),
      [
        ["@x/lib", 0, "publish", "0.1.0-next.9"],
        ["@x/cli", 1, "publish", "0.1.0-next.9"],
      ],
    );
    assert.equal(plan.commit, "abc123");
    assert.ok(plan.packages.every((p) => /^[0-9a-f]{64}$/.test(p.sha256)));
  });

  it("publishes nothing when both match what is live, and names the live versions", async () => {
    const w = workspace();
    const registry = {
      "@x/lib": {
        stableVersions: ["0.1.4"],
        next: { version: "0.1.5-next.3", shasum: "x", tarball: "t" },
      },
      "@x/cli": {
        stableVersions: ["0.1.4"],
        next: { version: "0.1.5-next.3", shasum: "y", tarball: "t" },
      },
    };
    const { deps } = fakeDeps({ ...w, registry, same: () => true });
    const plan = await prepare({
      pkgs: w.pkgs,
      outDir: join(w.root, "out"),
      build: 10,
      deps,
    });
    assert.deepEqual(
      plan.packages.map((p) => p.action),
      ["unchanged", "unchanged"],
    );
    assert.deepEqual(
      plan.packages.map((p) => p.version),
      ["0.1.5-next.3", "0.1.5-next.3"],
    );
  });

  it("republishes a dependent when its dependency changed, packing it against the new version", async () => {
    const w = workspace();
    const registry = {
      "@x/lib": {
        stableVersions: ["0.1.4"],
        next: { version: "0.1.5-next.3", shasum: "x", tarball: "t" },
      },
      "@x/cli": {
        stableVersions: ["0.1.4"],
        next: { version: "0.1.5-next.3", shasum: "y", tarball: "t" },
      },
    };
    // lib changed. cli is the same unless it was packed against a different lib.
    const same = (live, packed) =>
      packed.startsWith("@x/cli") ? packed.endsWith("lib=0.1.5-next.3") : false;
    const { deps, packs } = fakeDeps({ ...w, registry, same });
    const plan = await prepare({
      pkgs: w.pkgs,
      outDir: join(w.root, "out"),
      build: 11,
      deps,
    });
    assert.deepEqual(
      plan.packages.map((p) => [p.name, p.action, p.version]),
      [
        ["@x/lib", "publish", "0.1.5-next.11"],
        ["@x/cli", "publish", "0.1.5-next.11"],
      ],
    );
    // cli's final pack names lib's new version.
    const finalCli = packs.filter((p) => p.name === "@x/cli").at(-1);
    assert.equal(finalCli.version, "0.1.5-next.11");
  });
});

describe("publishPlan", () => {
  function preparedPlan(overrides = {}) {
    const root = mkdtempSync(join(tmpdir(), "publish-plan-test-"));
    const content = "tarball bytes";
    writeFileSync(join(root, "lib.tgz"), content);
    const plan = {
      schemaVersion: 1,
      channel: "next",
      commit: "abc123",
      build: 1,
      packages: [
        {
          name: "@x/lib",
          layer: 0,
          action: "publish",
          version: "0.1.5-next.1",
          file: "lib.tgz",
          sha1: createHash("sha1").update(content).digest("hex"),
          sha256: createHash("sha256").update(content).digest("hex"),
          ...overrides,
        },
      ],
    };
    const path = join(root, "next-plan.json");
    writeFileSync(path, JSON.stringify(plan));
    return path;
  }

  const lib = { path: "x", json: { name: "@x/lib", version: "0.1.0" } };
  const baseDeps = (extra = {}) => {
    const published = [];
    return {
      published,
      deps: {
        commit: () => "abc123",
        packages: () => [lib],
        state: async () => ({ stableVersions: [], next: null }),
        publish: async (file) => published.push(file),
        waitUntilInstallable: async () => undefined,
        ...extra,
      },
    };
  };

  it("publishes the verified tarball with the next tag and waits for it", async () => {
    const { deps, published } = baseDeps();
    const result = await publishPlan(preparedPlan(), deps);
    assert.deepEqual(result, ["@x/lib@0.1.5-next.1"]);
    assert.equal(published.length, 1);
  });

  it("refuses a plan made for another commit", async () => {
    const { deps } = baseDeps({ commit: () => "other" });
    await assert.rejects(
      publishPlan(preparedPlan(), deps),
      /does not match checkout/,
    );
  });

  it("refuses a tampered artifact before publishing anything", async () => {
    const path = preparedPlan({ sha256: "0".repeat(64) });
    const { deps, published } = baseDeps();
    await assert.rejects(publishPlan(path, deps), /hash mismatch/);
    assert.equal(published.length, 0);
  });

  it("refuses to publish anything that is not a next prerelease", async () => {
    const { deps, published } = baseDeps();
    await assert.rejects(
      publishPlan(preparedPlan({ version: "0.1.5" }), deps),
      /not a next prerelease/,
    );
    assert.equal(published.length, 0);
  });

  it("does not publish twice: an identical live version is only waited for", async () => {
    const path = preparedPlan();
    const shasum = JSON.parse(readFileSync(path, "utf8")).packages[0].sha1;
    const waited = [];
    const { deps, published } = baseDeps({
      state: async () => ({
        stableVersions: [],
        next: { version: "0.1.5-next.1", shasum, tarball: "t" },
      }),
      waitUntilInstallable: async (name, version) =>
        waited.push(`${name}@${version}`),
    });
    await publishPlan(path, deps);
    assert.equal(published.length, 0);
    assert.deepEqual(waited, ["@x/lib@0.1.5-next.1"]);
  });

  it("fails if the live version has different bytes", async () => {
    const { deps } = baseDeps({
      state: async () => ({
        stableVersions: [],
        next: { version: "0.1.5-next.1", shasum: "different", tarball: "t" },
      }),
    });
    await assert.rejects(
      publishPlan(preparedPlan(), deps),
      /different tarball/,
    );
  });

  it("rejects a plan for another channel", async () => {
    const root = mkdtempSync(join(tmpdir(), "publish-plan-test-"));
    const path = join(root, "plan.json");
    writeFileSync(
      path,
      JSON.stringify({ schemaVersion: 2, commit: "abc123", packages: [] }),
    );
    await assert.rejects(
      publishPlan(path, baseDeps().deps),
      /not a next-channel plan/,
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  findPackage,
  packagesWith,
  runnablePackages,
  scriptArgs,
  scriptNames,
} from "./pick.js";

const packages = runnablePackages([
  { dir: ".", name: "backstage", scripts: { build: "x", lint: "y" } },
  {
    dir: "packages/devtools",
    name: "@devdogsuga/devtools",
    scripts: { build: "tsdown", test: "vitest run", lint: "eslint ." },
  },
  { dir: "packages/brand", name: "@devdogsuga/brand", scripts: { test: "v" } },
  { dir: "packages/empty", name: "@devdogsuga/empty", scripts: {} },
  { dir: "apps/nameless", scripts: { dev: "d" } },
]);

describe("runnablePackages", () => {
  it("keeps packages with a name and at least one script", () => {
    expect(packages.map((pkg) => pkg.name)).toEqual([
      "backstage",
      "@devdogsuga/devtools",
      "@devdogsuga/brand",
    ]);
  });
});

describe("scriptNames", () => {
  it("lists each script once with how many packages have it, most common first", () => {
    expect(scriptNames(packages)).toEqual([
      { script: "build", count: 2 },
      { script: "lint", count: 2 },
      { script: "test", count: 2 },
    ]);
  });
});

describe("packagesWith", () => {
  it("returns the packages that define a script", () => {
    expect(packagesWith(packages, "build").map((pkg) => pkg.dir)).toEqual([
      ".",
      "packages/devtools",
    ]);
    expect(packagesWith(packages, "nope")).toEqual([]);
  });
});

describe("findPackage", () => {
  it("matches the exact name, the directory, or an unambiguous short name", () => {
    expect(findPackage(packages, "@devdogsuga/brand")?.dir).toBe(
      "packages/brand",
    );
    expect(findPackage(packages, "packages/devtools")?.name).toBe(
      "@devdogsuga/devtools",
    );
    expect(findPackage(packages, "devtools")?.name).toBe(
      "@devdogsuga/devtools",
    );
  });

  it("returns null for no match and for an ambiguous short name", () => {
    expect(findPackage(packages, "missing")).toBeNull();
    const twins = runnablePackages([
      { dir: "a/x", name: "@a/x", scripts: { s: "1" } },
      { dir: "b/x", name: "@b/x", scripts: { s: "1" } },
    ]);
    expect(findPackage(twins, "x")).toBeNull();
  });
});

describe("scriptArgs", () => {
  it("builds pnpm -F <package> run <script> with any extra arguments", () => {
    expect(scriptArgs({ name: "@devdogsuga/devtools" }, "test")).toEqual([
      "-F",
      "@devdogsuga/devtools",
      "run",
      "test",
    ]);
    expect(scriptArgs({ name: "p" }, "test", ["--watch"])).toEqual([
      "-F",
      "p",
      "run",
      "test",
      "--watch",
    ]);
  });
});

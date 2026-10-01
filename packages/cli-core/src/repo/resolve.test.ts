import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findDependent, packageNameOf, resolveFromRepo } from "./resolve.js";

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "devtools-resolve-test-"));
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

/** A minimal, real, `require`-resolvable npm-shaped package under repoRoot/node_modules. */
function writeInstalledPackage(
  name: string,
  opts: {
    exports?: Record<string, unknown>;
    main?: string;
    version?: string;
  } = {},
): void {
  const scopedDir = join(repoRoot, "node_modules", ...name.split("/"));
  mkdirSync(scopedDir, { recursive: true });
  const pkgJson: Record<string, unknown> = {
    name,
    version: opts.version ?? "1.2.3",
    type: "module",
  };
  if (opts.main) pkgJson.main = opts.main;
  if (opts.exports) pkgJson.exports = opts.exports;
  writeFileSync(join(scopedDir, "package.json"), JSON.stringify(pkgJson));
  writeFileSync(join(scopedDir, "index.js"), "export const marker = true;\n");
  if (opts.exports) {
    for (const value of Object.values(
      opts.exports["."] as Record<string, string>,
    )) {
      const target = join(scopedDir, value);
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, "export const marker = true;\n");
    }
  }
}

function writeApp(dir: string, deps: Record<string, string>): void {
  const appDir = join(repoRoot, "apps", dir);
  mkdirSync(appDir, { recursive: true });
  writeFileSync(
    join(appDir, "package.json"),
    JSON.stringify({ name: `@devdogsuga/${dir}`, dependencies: deps }),
  );
}

describe("packageNameOf", () => {
  it("strips a subpath off a scoped package", () => {
    expect(packageNameOf("@devdogsuga/env/load")).toBe("@devdogsuga/env");
  });

  it("leaves a bare scoped package alone", () => {
    expect(packageNameOf("@devdogsuga/env")).toBe("@devdogsuga/env");
  });

  it("strips a subpath off an unscoped package", () => {
    expect(packageNameOf("tsx/esm/api")).toBe("tsx");
  });
});

describe("findDependent", () => {
  it("matches a dependent declaring the package even when asked for a subpath specifier", () => {
    writeApp("platform", { "@devdogsuga/env": "^0.1.0" });
    expect(findDependent(repoRoot, "@devdogsuga/env/load")).toBe(
      join("apps", "platform", "package.json"),
    );
  });

  it("finds an app under apps/* that depends on the specifier", () => {
    writeApp("platform", { "@devdogsuga/env": "^0.1.0" });
    expect(findDependent(repoRoot, "@devdogsuga/env")).toBe(
      join("apps", "platform", "package.json"),
    );
  });

  it("finds a package under packages/* when apps/* has no dependent", () => {
    const pkgDir = join(repoRoot, "packages", "open-graph");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "package.json"),
      JSON.stringify({
        name: "@devdogsuga/open-graph",
        dependencies: { "@devdogsuga/brand": "^0.1.0" },
      }),
    );
    expect(findDependent(repoRoot, "@devdogsuga/brand")).toBe(
      join("packages", "open-graph", "package.json"),
    );
  });

  it("returns null when nothing in the repo depends on the specifier", () => {
    writeApp("platform", {});
    expect(findDependent(repoRoot, "@devdogsuga/nonexistent")).toBeNull();
  });

  it("looks in devDependencies and peerDependencies too", () => {
    const appDir = join(repoRoot, "apps", "sandbox");
    mkdirSync(appDir, { recursive: true });
    writeFileSync(
      join(appDir, "package.json"),
      JSON.stringify({
        name: "@devdogsuga/sandbox",
        peerDependencies: { "@devdogsuga/config": "*" },
      }),
    );
    expect(findDependent(repoRoot, "@devdogsuga/config")).toBe(
      join("apps", "sandbox", "package.json"),
    );
  });
});

describe("resolveFromRepo", () => {
  it("resolves a plain installed dependency's default entry and version", () => {
    writeInstalledPackage("@devdogsuga/env", { version: "0.4.2" });
    writeApp("platform", { "@devdogsuga/env": "^0.4.2" });

    const result = resolveFromRepo(
      repoRoot,
      join("apps", "platform", "package.json"),
      "@devdogsuga/env",
    );

    expect(result.version).toBe("0.4.2");
    expect(result.resolvedPath).toBe(
      join(repoRoot, "node_modules", "@devdogsuga", "env", "index.js"),
    );
    expect(result.pkgJsonPath).toBe(
      join(repoRoot, "node_modules", "@devdogsuga", "env", "package.json"),
    );
  });

  it("does not throw ERR_PACKAGE_PATH_NOT_EXPORTED reading package.json for a package with no exported package.json", () => {
    // Real @devdogsuga/env / @devdogsuga/open-graph shape: exports["."] exists,
    // but exports["./package.json"] does not. resolveFromRepo must still find
    // the package's own package.json by walking up from the resolved file.
    writeInstalledPackage("@devdogsuga/env", {
      exports: { ".": { default: "./index.js" } },
    });
    writeApp("platform", { "@devdogsuga/env": "^1.2.3" });

    expect(() =>
      resolveFromRepo(
        repoRoot,
        join("apps", "platform", "package.json"),
        "@devdogsuga/env",
      ),
    ).not.toThrow();
  });

  it("picks the given export condition over default, per the exports map", () => {
    writeInstalledPackage("@devdogsuga/open-graph", {
      exports: {
        ".": { "devdogs-source": "./src/index.ts", default: "./dist/index.js" },
      },
    });
    writeApp("platform", { "@devdogsuga/open-graph": "workspace:*" });

    const result = resolveFromRepo(
      repoRoot,
      join("apps", "platform", "package.json"),
      "@devdogsuga/open-graph",
      { condition: "devdogs-source" },
    );

    expect(result.resolvedPath).toBe(
      join(
        repoRoot,
        "node_modules",
        "@devdogsuga",
        "open-graph",
        "src",
        "index.ts",
      ),
    );
  });

  it("falls back to the default export when the requested condition is absent", () => {
    writeInstalledPackage("@devdogsuga/docs", {
      exports: { ".": { default: "./dist/index.js" } },
    });
    writeApp("platform", { "@devdogsuga/docs": "workspace:*" });

    const result = resolveFromRepo(
      repoRoot,
      join("apps", "platform", "package.json"),
      "@devdogsuga/docs",
      { condition: "devdogs-source" },
    );

    expect(result.resolvedPath).toBe(
      join(repoRoot, "node_modules", "@devdogsuga", "docs", "dist", "index.js"),
    );
  });

  it("finds the owning package.json by walking up from a workspace-symlinked realpath, not a node_modules string match", () => {
    // Simulates pnpm's workspace linking: node_modules/@devdogsuga/brand is a
    // symlink whose REALPATH is packages/brand/dist/index.js, which contains
    // no literal "node_modules/@devdogsuga/brand" segment at all.
    const realPkgDir = join(repoRoot, "packages", "brand");
    mkdirSync(join(realPkgDir, "dist"), { recursive: true });
    writeFileSync(
      join(realPkgDir, "package.json"),
      JSON.stringify({
        name: "@devdogsuga/brand",
        version: "0.9.0",
        main: "dist/index.js",
      }),
    );
    writeFileSync(
      join(realPkgDir, "dist", "index.js"),
      "export const marker = true;\n",
    );

    mkdirSync(join(repoRoot, "node_modules", "@devdogsuga"), {
      recursive: true,
    });
    symlinkSync(
      realPkgDir,
      join(repoRoot, "node_modules", "@devdogsuga", "brand"),
      "dir",
    );

    writeApp("open-graph", { "@devdogsuga/brand": "^0.9.0" });

    const result = resolveFromRepo(
      repoRoot,
      join("apps", "open-graph", "package.json"),
      "@devdogsuga/brand",
    );

    expect(result.version).toBe("0.9.0");
    expect(result.pkgJsonPath).toBe(join(realPkgDir, "package.json"));
  });
});

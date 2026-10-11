import { rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeProduct, writeFiles } from "./fixtures.js";
import {
  generatorFor,
  hashSchemas,
  schemaFiles,
  schemaHashFor,
  typesAssetName,
} from "./schema-hash.js";

describe("the schema hash", () => {
  it("is stable for the same files and generator", () => {
    const product = makeProduct();
    expect(schemaHashFor(product)).toBe(schemaHashFor(product));
    expect(schemaHashFor(product)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("lists files by sorted POSIX path", () => {
    const product = makeProduct({
      files: { "supabase/schemas/dogpack/functions/a.sql": "select 1;\n" },
    });
    expect(schemaFiles(product.paths.schemasDir)).toEqual([
      "dogpack/functions/a.sql",
      "dogpack/schema.sql",
      "dogpack/tables/sessions.sql",
    ]);
  });

  it("changes when a file changes, appears or disappears", () => {
    const product = makeProduct();
    const base = schemaHashFor(product);

    writeFiles(product.root, {
      "supabase/schemas/dogpack/tables/sessions.sql":
        "create table dogpack.sessions (id int);\n",
    });
    const edited = schemaHashFor(product);
    expect(edited).not.toBe(base);

    writeFiles(product.root, {
      "supabase/schemas/dogpack/tables/members.sql": "x\n",
    });
    const added = schemaHashFor(product);
    expect(added).not.toBe(edited);

    rmSync(join(product.paths.schemasDir, "dogpack", "tables", "members.sql"));
    expect(schemaHashFor(product)).toBe(edited);
  });

  it("changes when a file is renamed, even with the same contents", () => {
    const product = makeProduct();
    const before = schemaHashFor(product);
    writeFiles(product.root, {
      "supabase/schemas/dogpack/tables/renamed.sql":
        "create table dogpack.sessions (id uuid primary key);\n",
    });
    rmSync(join(product.paths.schemasDir, "dogpack", "tables", "sessions.sql"));
    expect(schemaHashFor(product)).not.toBe(before);
  });

  it("ignores line endings: a CRLF checkout hashes like an LF one", () => {
    const lf = makeProduct();
    const crlf = makeProduct({
      files: {
        "supabase/schemas/dogpack/schema.sql":
          "create schema if not exists dogpack;\r\n",
        "supabase/schemas/dogpack/tables/sessions.sql":
          "create table dogpack.sessions (id uuid primary key);\r\n",
      },
    });
    expect(schemaHashFor(crlf)).toBe(schemaHashFor(lf));
  });

  it("covers the generator and its version", () => {
    const product = makeProduct();
    const dir = product.paths.schemasDir;
    expect(hashSchemas(dir, "supabase@2.117.0")).not.toBe(
      hashSchemas(dir, "supabase@2.120.0"),
    );
    expect(hashSchemas(dir, "supabase@2.117.0")).not.toBe(
      hashSchemas(dir, "supadart@1.9.3"),
    );
  });

  it("uses the pinned CLI for TypeScript products", () => {
    expect(generatorFor(makeProduct())).toBe("supabase@2.117.0");
  });

  it("uses the resolved supadart version for Dart products", () => {
    const withLock = makeProduct({
      config: { types: { kind: "supadart", out: "lib/generated" } },
      files: {
        "pubspec.yaml": "dev_dependencies:\n  supadart: ^1.9.3\n",
        "pubspec.lock":
          'packages:\n  supabase:\n    dependency: transitive\n    version: "2.0.0"\n  supadart:\n    dependency: "direct dev"\n    description:\n      name: supadart\n    source: hosted\n    version: "1.9.4"\n',
      },
    });
    expect(generatorFor(withLock)).toBe("supadart@1.9.4");

    const noLock = makeProduct({
      config: { types: { kind: "supadart", out: "lib/generated" } },
      files: { "pubspec.yaml": "dev_dependencies:\n  supadart: ^1.9.3\n" },
    });
    expect(generatorFor(noLock)).toBe("supadart@^1.9.3");
  });

  it("names the release asset for a hash", () => {
    expect(typesAssetName("dogpack", "abc123")).toBe(
      "dogpack-types-abc123.tgz",
    );
  });
});

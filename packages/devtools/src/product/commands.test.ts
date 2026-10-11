import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { regenerateAfterSync } from "./commands.js";
import { CLI, makeProduct, recordingRunner, writeFiles } from "./fixtures.js";
import type { DbTarget } from "./target.js";

const LOCAL: DbTarget = {
  kind: "local",
  apiUrl: "http://127.0.0.1:54321",
  dbUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  publishableKey: "p",
  secretKey: "sb_secret_s",
};

const APPLIED = {
  migration: "20261011_devtools_sync.sql",
  applied: true,
  destructive: [],
};
const MATCHED = { migration: null, applied: false, destructive: [] };

describe("regenerateAfterSync (Q82: db sync regenerates the types)", () => {
  it("regenerates after a sync that changed the database", async () => {
    const product = makeProduct();
    const { run, calls } = recordingRunner(() => ({ stdout: "export {};\n" }));
    await regenerateAfterSync(product, CLI, LOCAL, APPLIED, { run });
    expect(calls).toHaveLength(1);
    expect(
      readFileSync(join(product.root, "lib/database.types.ts"), "utf8"),
    ).toContain("export {};");
  });

  it("regenerates when nothing changed but the types are missing or stale", async () => {
    const product = makeProduct();
    const { run, calls } = recordingRunner(() => ({ stdout: "x" }));
    await regenerateAfterSync(product, CLI, LOCAL, MATCHED, { run });
    expect(calls).toHaveLength(1);
    // Current now: a second no-op sync leaves them alone.
    await regenerateAfterSync(product, CLI, LOCAL, MATCHED, { run });
    expect(calls).toHaveLength(1);
    // The schema moves on without a sync (an edit pulled in by git).
    writeFiles(product.root, {
      "supabase/schemas/dogpack/tables/new.sql": "create table dogpack.n ();\n",
    });
    await regenerateAfterSync(product, CLI, LOCAL, MATCHED, { run });
    expect(calls).toHaveLength(2);
  });

  it("writes nothing on a dry run", async () => {
    const product = makeProduct();
    const { run, calls } = recordingRunner();
    await regenerateAfterSync(product, CLI, null, APPLIED, { run });
    expect(calls).toHaveLength(0);
    expect(existsSync(join(product.root, "lib/database.types.ts"))).toBe(false);
  });

  it("warns instead of failing when the generator does, because the sync worked", async () => {
    const product = makeProduct();
    const { run } = recordingRunner(() => ({ code: 1, stderr: "boom" }));
    await expect(
      regenerateAfterSync(product, CLI, LOCAL, APPLIED, { run }),
    ).resolves.toBeUndefined();
  });
});

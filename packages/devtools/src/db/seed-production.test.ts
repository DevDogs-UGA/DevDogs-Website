import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRepoRootCacheForTests } from "@devdogsuga/cli-core/repo/root";
import { runSeedProduction, type SeedProductionDb } from "./seed-production.js";

/**
 * `connect` is injected rather than a real Postgres — this only needs to see
 * WHAT `runSeedProduction` sends over the connection, in what order, and that
 * it always closes it. `postgres`'s own `prepare: false` / simple-query-
 * protocol choice (the reason this module exists rather than shelling out to
 * `supabase db query --file`, which chokes on a multi-statement file — see
 * this module's header) is not something a unit test can observe without a
 * real database; that was proven once against the local stack instead.
 *
 * The seed files themselves are real, on a real temp dir pointed to by
 * `DEVTOOLS_TEST_REPO_ROOT`, matching `repo/root.test.ts`'s pattern — this
 * command's whole point is discovering the file list from the repo rather
 * than hardcoding it, so the test should exercise a real `readdirSync`.
 */
let dir: string;
const savedEnv = process.env.DEVTOOLS_TEST_REPO_ROOT;

function fakeDb(behavior: { fail?: string } = {}): {
  db: SeedProductionDb;
  calls: string[];
  ended: boolean;
} {
  const calls: string[] = [];
  const state = { ended: false };
  const db: SeedProductionDb = {
    async unsafe(query: string) {
      calls.push(query);
      if (behavior.fail !== undefined && query.includes(behavior.fail)) {
        throw new Error("boom");
      }
      return [];
    },
    async end() {
      state.ended = true;
    },
  };
  return {
    db,
    calls,
    get ended() {
      return state.ended;
    },
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "devtools-seed-production-test-"));
  resetRepoRootCacheForTests();
  process.env.DEVTOOLS_TEST_REPO_ROOT = dir;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  resetRepoRootCacheForTests();
  if (savedEnv === undefined) delete process.env.DEVTOOLS_TEST_REPO_ROOT;
  else process.env.DEVTOOLS_TEST_REPO_ROOT = savedEnv;
});

function writeSeedFile(name: string, sql: string): void {
  const seedDir = join(dir, "supabase", "seed", "production");
  mkdirSync(seedDir, { recursive: true });
  writeFileSync(join(seedDir, name), sql);
}

describe("runSeedProduction", () => {
  it("runs every production seed file's raw text, in filename order", async () => {
    writeSeedFile(
      "03_officers.sql",
      "insert into officers values (1); insert into officers values (2);",
    );
    writeSeedFile("01_roles.sql", "insert into roles values (1);");

    const fake = fakeDb();
    const connect = vi.fn(() => fake.db);

    const code = await runSeedProduction("postgresql://example/db", {
      connect,
    });

    expect(code).toBe(0);
    expect(connect).toHaveBeenCalledWith("postgresql://example/db");
    expect(fake.calls).toEqual([
      "insert into roles values (1);",
      "insert into officers values (1); insert into officers values (2);",
    ]);
    expect(fake.ended).toBe(true);
  });

  it("ignores non-.sql files in the production directory", async () => {
    writeSeedFile("01_roles.sql", "insert into roles values (1);");
    writeFileSync(
      join(dir, "supabase", "seed", "production", "README.md"),
      "not sql",
    );

    const fake = fakeDb();
    await runSeedProduction("postgresql://example/db", {
      connect: () => fake.db,
    });

    expect(fake.calls).toHaveLength(1);
  });

  it("stops at the first failing file, closes the connection, and returns 1", async () => {
    writeSeedFile("01_roles.sql", "insert into roles values (1);");
    writeSeedFile("03_officers.sql", "insert into officers values (1);");

    const fake = fakeDb({ fail: "roles" });
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    const code = await runSeedProduction("postgresql://example/db", {
      connect: () => fake.db,
    });

    expect(code).toBe(1);
    expect(fake.calls).toEqual(["insert into roles values (1);"]);
    expect(fake.ended).toBe(true);
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("01_roles.sql"),
    );
    stderr.mockRestore();
  });
});

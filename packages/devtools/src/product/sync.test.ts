import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CLI, makeProduct, recordingRunner, writeFiles } from "./fixtures.js";
import {
  dbSync,
  destructiveStatements,
  forgetMigrations,
  SyncError,
} from "./sync.js";
import type { SqlSession } from "./dev-data.js";
import type { DbTarget } from "./target.js";

const LOCAL: DbTarget = {
  kind: "local",
  apiUrl: "http://127.0.0.1:54321",
  dbUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  publishableKey: "p",
  secretKey: "s",
};
const HOSTED: DbTarget = {
  ...LOCAL,
  kind: "hosted",
  dbUrl:
    "postgresql://postgres.zzzzzzzzzzzzzzzzzzzz:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
};

const CREATE = "create table dogpack.sessions (id uuid primary key);\n";

/** A runner whose `declarative sync` writes `sql` as a new migration. */
function runnerThatGenerates(
  productRoot: string,
  sql: string | null,
  apply: { code: number } = { code: 0 },
) {
  return recordingRunner(({ args }) => {
    if (args.includes("declarative")) {
      if (sql !== null) {
        writeFiles(productRoot, {
          "supabase/migrations/20261011120000_devtools_sync.sql": sql,
        });
      }
      return { stdout: sql === null ? "No schema changes found" : "" };
    }
    if (args[0] === "migration" || args[0] === "db") return apply;
    return undefined;
  });
}

describe("dbSync", () => {
  it("does nothing when the database already matches", async () => {
    const product = makeProduct();
    const { run, calls } = runnerThatGenerates(product.root, null);
    const result = await dbSync(product, CLI, LOCAL, run, { yes: false });
    expect(result).toEqual({
      migration: null,
      applied: false,
      destructive: [],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual([
      "db",
      "schema",
      "declarative",
      "sync",
      "--no-apply",
      "--name",
      "devtools_sync",
    ]);
  });

  it("applies a new migration to the local stack with migration up", async () => {
    const product = makeProduct();
    const { run, calls } = runnerThatGenerates(product.root, CREATE);
    const result = await dbSync(product, CLI, LOCAL, run, { yes: false });
    expect(result.migration).toBe("20261011120000_devtools_sync.sql");
    expect(result.applied).toBe(true);
    expect(calls[1]?.args).toEqual(["migration", "up", "--local"]);
  });

  it("pushes to a hosted project through its DB_URL", async () => {
    const product = makeProduct();
    const { run, calls } = runnerThatGenerates(product.root, CREATE);
    await dbSync(product, CLI, HOSTED, run, { yes: false });
    // Calls: fetch the record (this machine has none), diff, push.
    expect(calls[2]?.args).toEqual([
      "db",
      "push",
      "--db-url",
      HOSTED.dbUrl,
      "--yes",
    ]);
  });

  it("restores the record from a hosted project's history on a machine that has none", async () => {
    const product = makeProduct();
    const { run, calls } = recordingRunner(({ args }) => {
      if (args[0] === "migration" && args[1] === "fetch") {
        writeFiles(product.root, {
          "supabase/migrations/20261001000000_first.sql": CREATE,
        });
        return { stdout: "Migration history fetched" };
      }
      if (args.includes("declarative")) {
        return { stdout: "No schema changes found" };
      }
      return undefined;
    });
    const logs: string[] = [];
    const result = await dbSync(product, CLI, HOSTED, run, {
      yes: false,
      log: (line) => logs.push(line),
    });
    expect(calls[0]?.args).toEqual([
      "migration",
      "fetch",
      "--db-url",
      HOSTED.dbUrl,
    ]);
    expect(calls[1]?.args).toContain("declarative");
    expect(logs).toContain(
      "Restored 1 applied migration from the project's history.",
    );
    expect(result.migration).toBeNull();
  });

  it("carries on when a new hosted project has no history to restore", async () => {
    const product = makeProduct();
    const { run } = recordingRunner(({ args }) => {
      if (args[0] === "migration" && args[1] === "fetch") {
        return { code: 1, stderr: "schema_migrations does not exist" };
      }
      if (args.includes("declarative")) {
        writeFiles(product.root, {
          "supabase/migrations/20261011120000_devtools_sync.sql": CREATE,
        });
        return { stdout: "" };
      }
      return { code: 0 };
    });
    const result = await dbSync(product, CLI, HOSTED, run, { yes: false });
    expect(result.applied).toBe(true);
  });

  it("does not fetch when this machine already has a record, nor for the local stack", async () => {
    const hosted = makeProduct({
      files: { "supabase/migrations/20261001000000_first.sql": CREATE },
    });
    const first = runnerThatGenerates(hosted.root, null);
    await dbSync(hosted, CLI, HOSTED, first.run, { yes: false });
    expect(first.calls.map((c) => c.args[0])).toEqual(["db"]);

    const local = makeProduct();
    const second = runnerThatGenerates(local.root, null);
    await dbSync(local, CLI, LOCAL, second.run, { yes: false });
    expect(second.calls.map((c) => c.args[0])).toEqual(["db"]);
  });

  it("prefixes the npx form of the CLI to every call", async () => {
    const product = makeProduct();
    const { run, calls } = runnerThatGenerates(product.root, CREATE);
    const npx = {
      command: "npx",
      prefix: ["--yes", "supabase@2.117.0"],
      source: "npx" as const,
    };
    await dbSync(product, npx, LOCAL, run, { yes: false });
    expect(calls.map((c) => c.command)).toEqual(["npx", "npx"]);
    expect(calls[1]?.args.slice(0, 3)).toEqual([
      "--yes",
      "supabase@2.117.0",
      "migration",
    ]);
  });

  describe("a change that drops data", () => {
    const DROP = `${CREATE}alter table dogpack.sessions drop column title;\n`;

    it("is refused without --yes or an answer, and leaves no migration behind", async () => {
      const product = makeProduct();
      const { run, calls } = runnerThatGenerates(product.root, DROP);
      await expect(
        dbSync(product, CLI, LOCAL, run, { yes: false }),
      ).rejects.toThrow(/drops data/);
      expect(calls).toHaveLength(1); // never applied
      expect(readdirSync(product.paths.migrationsDir)).toEqual([]);
    });

    it("is applied when the contributor confirms", async () => {
      const product = makeProduct();
      const { run } = runnerThatGenerates(product.root, DROP);
      const confirmDestructive = vi.fn().mockResolvedValue(true);
      const result = await dbSync(product, CLI, LOCAL, run, {
        yes: false,
        confirmDestructive,
      });
      expect(confirmDestructive).toHaveBeenCalledOnce();
      expect(result.destructive).toHaveLength(1);
      expect(result.applied).toBe(true);
    });

    it("is applied with --yes without asking", async () => {
      const product = makeProduct();
      const { run } = runnerThatGenerates(product.root, DROP);
      const confirmDestructive = vi.fn();
      await dbSync(product, CLI, LOCAL, run, { yes: true, confirmDestructive });
      expect(confirmDestructive).not.toHaveBeenCalled();
    });
  });

  it("removes the migration when it does not apply, so the next diff starts from the truth", async () => {
    const product = makeProduct();
    const { run } = runnerThatGenerates(product.root, CREATE, { code: 1 });
    await expect(
      dbSync(product, CLI, LOCAL, run, { yes: false }),
    ).rejects.toThrow(/did not apply/);
    expect(readdirSync(product.paths.migrationsDir)).toEqual([]);
  });

  it("blames Docker when the diff fails for a Docker reason", async () => {
    const product = makeProduct();
    const { run } = recordingRunner(() => ({
      code: 1,
      stderr: "failed to inspect the postgres image",
    }));
    await expect(
      dbSync(product, CLI, LOCAL, run, { yes: false }),
    ).rejects.toThrow(/Docker is needed/);
  });

  it("retries the diff once when the shadow container fails to start", async () => {
    const product = makeProduct();
    let diffs = 0;
    const { run } = recordingRunner(({ args }) => {
      if (!args.includes("declarative")) return undefined;
      diffs++;
      if (diffs === 1) {
        return { code: 1, stderr: "error running container: exit 1" };
      }
      writeFiles(product.root, {
        "supabase/migrations/20261011120000_devtools_sync.sql": CREATE,
      });
      return undefined;
    });
    const result = await dbSync(product, CLI, LOCAL, run, { yes: false });
    expect(diffs).toBe(2);
    expect(result.applied).toBe(true);
  });

  it("prints what it would run and changes nothing in a dry run", async () => {
    const product = makeProduct();
    const { run, calls } = recordingRunner();
    const lines: string[] = [];
    const result = await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      dryRun: true,
      log: (line) => lines.push(line),
    });
    expect(calls).toEqual([]);
    expect(result.applied).toBe(false);
    expect(lines.join("\n")).toContain("declarative sync --no-apply");
  });

  it("fails clearly when there is no schemas directory", async () => {
    const product = makeProduct();
    const lonely = {
      ...product,
      paths: { ...product.paths, schemasDir: join(product.root, "nope") },
    };
    const { run } = recordingRunner();
    await expect(
      dbSync(lonely, CLI, LOCAL, run, { yes: false }),
    ).rejects.toBeInstanceOf(SyncError);
  });
});

/** A database as sync sees it: its ledger (null: none) and which schemas exist. */
function database(ledger: string[] | null, schemas: string[]) {
  const session: SqlSession = {
    members: () => Promise.resolve([]),
    memberByRef: () => Promise.resolve(null),
    appliedMigrations: () => Promise.resolve(ledger),
    missingSchemas: (wanted) =>
      Promise.resolve(wanted.filter((name) => !schemas.includes(name))),
    runAs: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };
  return (dbUrl: string) => {
    void dbUrl;
    return session;
  };
}

describe("dbSync against what the database really has", () => {
  const FIRST = "20261001000000_devtools_sync.sql";
  const withRecord = () =>
    makeProduct({ files: { [`supabase/migrations/${FIRST}`]: CREATE } });

  it("trusts the record when the ledger and schemas agree with it", async () => {
    const product = withRecord();
    const { run, calls } = runnerThatGenerates(product.root, null);
    const result = await dbSync(product, CLI, HOSTED, run, {
      yes: false,
      open: database(["20261001000000"], ["dogpack"]),
    });
    expect(result.migration).toBeNull();
    expect(calls.map((c) => c.args[0])).toEqual(["db"]);
    expect(existsSync(join(product.paths.migrationsDir, FIRST))).toBe(true);
  });

  it("re-applies the whole schema to a hosted project reset from the dashboard", async () => {
    const product = withRecord();
    const logs: string[] = [];
    const { run, calls } = recordingRunner(({ args }) => {
      if (args.includes("declarative")) {
        // The record is gone by now, so the diff writes the full schema.
        expect(readdirSync(product.paths.migrationsDir)).toEqual([]);
        writeFiles(product.root, {
          "supabase/migrations/20261011120000_devtools_sync.sql": CREATE,
        });
      }
      return undefined;
    });
    const result = await dbSync(product, CLI, HOSTED, run, {
      yes: false,
      log: (line) => logs.push(line),
      // A reset project: no ledger table, no schema.
      open: database(null, []),
    });
    expect(result.applied).toBe(true);
    expect(result.migration).toBe("20261011120000_devtools_sync.sql");
    expect(calls.map((c) => c.args.slice(0, 2).join(" "))).toEqual([
      "db schema",
      "db push",
    ]);
    expect(logs.join("\n")).toMatch(/missing schema dogpack/);
  });

  it("clears a stale ledger before re-applying when the schema is gone but the ledger is not", async () => {
    const product = withRecord();
    const { run, calls } = recordingRunner(({ args }) => {
      if (args.includes("declarative")) {
        writeFiles(product.root, {
          "supabase/migrations/20261011120000_devtools_sync.sql": CREATE,
        });
      }
      return undefined;
    });
    await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      open: database(["20261001000000"], []),
    });
    expect(calls[0]?.args).toEqual([
      "migration",
      "repair",
      "--status",
      "reverted",
      "--db-url",
      LOCAL.dbUrl,
      "20261001000000",
    ]);
    expect(calls[1]?.args).toContain("declarative");
    expect(calls[2]?.args).toEqual(["migration", "up", "--local"]);
  });

  it("re-applies a migration missing from the ledger when a checkout switches from local to hosted", async () => {
    const product = makeProduct({
      files: {
        [`supabase/migrations/${FIRST}`]: CREATE,
        "supabase/migrations/20261005000000_devtools_sync.sql": CREATE,
      },
    });
    const { run } = recordingRunner(({ args }) => {
      if (args.includes("declarative")) {
        // Only the migration the project has stays in the record.
        expect(readdirSync(product.paths.migrationsDir)).toEqual([FIRST]);
        writeFiles(product.root, {
          "supabase/migrations/20261011120000_devtools_sync.sql": CREATE,
        });
      }
      return undefined;
    });
    const result = await dbSync(product, CLI, HOSTED, run, {
      yes: false,
      open: database(["20261001000000"], ["dogpack"]),
    });
    expect(result.applied).toBe(true);
  });

  it("fails clearly when the stale ledger cannot be cleared", async () => {
    const product = withRecord();
    const { run } = recordingRunner(({ args }) =>
      args[1] === "repair" ? { code: 1, stderr: "denied" } : undefined,
    );
    await expect(
      dbSync(product, CLI, HOSTED, run, {
        yes: false,
        open: database(["20261001000000"], []),
      }),
    ).rejects.toThrow(/clearing that history failed/);
  });

  it("carries on with the local record when the database cannot be asked", async () => {
    const product = withRecord();
    const { run } = runnerThatGenerates(product.root, null);
    const logs: string[] = [];
    const result = await dbSync(product, CLI, HOSTED, run, {
      yes: false,
      log: (line) => logs.push(line),
      open: () => {
        throw new Error("connection refused");
      },
    });
    expect(result.migration).toBeNull();
    expect(logs.join("\n")).toMatch(/Could not check/);
  });
});

describe("destructiveStatements", () => {
  it("finds drops of tables, columns, schemas, types, views and functions", () => {
    const sql = [
      "drop table a;",
      "alter table b drop column c;",
      "DROP SCHEMA d CASCADE;",
      "drop type e;",
      "drop view f;",
      "drop materialized view g;",
      "drop function h();",
    ].join("\n");
    expect(destructiveStatements(sql)).toHaveLength(7);
  });

  it("leaves constraints, indexes, policies and triggers alone", () => {
    const sql = [
      "alter table a drop constraint c;",
      "drop index i;",
      'drop policy "p" on a;',
      "drop trigger t on a;",
      "-- drop table commented_out;",
    ].join("\n");
    expect(destructiveStatements(sql)).toEqual([]);
  });
});

describe("forgetMigrations", () => {
  it("removes the local record and says what it removed", () => {
    const product = makeProduct({
      files: {
        "supabase/migrations/1_a.sql": "x",
        "supabase/migrations/2_b.sql": "y",
        "supabase/migrations/README.md": "keep",
      },
    });
    expect(forgetMigrations(product)).toEqual(["1_a.sql", "2_b.sql"]);
    expect(existsSync(join(product.paths.migrationsDir, "README.md"))).toBe(
      true,
    );
  });
});

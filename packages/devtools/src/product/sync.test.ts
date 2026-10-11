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
    expect(calls[1]?.args).toEqual([
      "db",
      "push",
      "--db-url",
      HOSTED.dbUrl,
      "--yes",
    ]);
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

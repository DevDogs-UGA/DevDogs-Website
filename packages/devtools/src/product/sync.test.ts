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
function database(
  ledger: string[] | null | Error,
  schemas: string[],
  executed: string[] = [],
) {
  const session: SqlSession = {
    members: () => Promise.resolve([]),
    memberByRef: () => Promise.resolve(null),
    appliedMigrations: () =>
      ledger instanceof Error
        ? Promise.reject(ledger)
        : Promise.resolve(ledger),
    missingSchemas: (wanted) =>
      Promise.resolve(wanted.filter((name) => !schemas.includes(name))),
    exec: (sql) => {
      executed.push(sql);
      return Promise.resolve();
    },
    runAs: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };
  return (dbUrl: string) => {
    void dbUrl;
    return session;
  };
}

const RESTORE = 'create table dogpack."userPlanDraftCourses" (id uuid);\n';

/** What `supabase db diff --output-format json` prints: progress, then the answer. */
const diffOutput = (diff: string) =>
  `Applying migration 20261001000000_devtools_sync.sql...\n${JSON.stringify({ diff, schemas: ["dogpack"], engine: "pg-delta" })}\n`;

/** A runner for a database whose live diff is `diff`; `declarative` writes `generated` (or nothing). */
function liveRunner(
  productRoot: string,
  diff: string,
  generated: string | null = null,
) {
  return recordingRunner(({ args }) => {
    if (args[0] === "db" && args[1] === "diff") {
      return { stdout: diffOutput(diff) };
    }
    if (args.includes("declarative") && generated !== null) {
      writeFiles(productRoot, {
        "supabase/migrations/20261011120000_devtools_sync.sql": generated,
      });
    }
    return undefined;
  });
}

const verbs = (calls: { args: string[] }[]) =>
  calls.map((c) => c.args.slice(0, 2).join(" "));

describe("dbSync against what the database really has", () => {
  const FIRST = "20261001000000_devtools_sync.sql";
  const withRecord = () =>
    makeProduct({ files: { [`supabase/migrations/${FIRST}`]: CREATE } });

  it("says it matches only when the live diff is empty, and changes nothing", async () => {
    const product = withRecord();
    const executed: string[] = [];
    const { run, calls } = liveRunner(product.root, "");
    const logs: string[] = [];
    const result = await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      log: (line) => logs.push(line),
      open: database(["20261001000000"], ["dogpack"], executed),
    });
    expect(result).toEqual({
      migration: null,
      applied: false,
      destructive: [],
    });
    expect(verbs(calls)).toEqual(["db diff", "db schema"]);
    expect(calls[0]?.args).toEqual([
      "db",
      "diff",
      "--from",
      "local",
      "--to",
      "migrations",
      "--use-pg-delta",
      "--schema",
      "dogpack",
      "--output-format",
      "json",
    ]);
    expect(executed).toEqual([]);
    expect(logs).toEqual(["The database already matches supabase/schemas."]);
    expect(existsSync(join(product.paths.migrationsDir, FIRST))).toBe(true);
  });

  it("diffs a hosted project through its DB_URL", async () => {
    const product = withRecord();
    const { run, calls } = liveRunner(product.root, "");
    await dbSync(product, CLI, HOSTED, run, {
      yes: false,
      open: database(["20261001000000"], ["dogpack"]),
    });
    expect(calls[0]?.args.slice(0, 4)).toEqual([
      "db",
      "diff",
      "--from",
      HOSTED.dbUrl,
    ]);
  });

  it("re-creates a single dropped table, keeps the record and the other tables", async () => {
    const product = withRecord();
    const executed: string[] = [];
    const { run, calls } = liveRunner(product.root, RESTORE);
    const logs: string[] = [];
    const result = await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      log: (line) => logs.push(line),
      open: database(["20261001000000"], ["dogpack"], executed),
    });
    expect(executed).toEqual([RESTORE.trim()]);
    expect(result).toEqual({ migration: null, applied: true, destructive: [] });
    // No migration file, no ledger repair (the ledger already lists the record).
    expect(verbs(calls)).toEqual(["db diff", "db schema"]);
    expect(readdirSync(product.paths.migrationsDir)).toEqual([FIRST]);
    expect(logs.join("\n")).toMatch(/lost part of supabase\/schemas/);
    expect(logs.join("\n")).not.toMatch(/already matches/);
  });

  it("re-creates a schema that is gone, without touching the record", async () => {
    const product = withRecord();
    const executed: string[] = [];
    const { run } = liveRunner(product.root, "create schema dogpack;");
    const logs: string[] = [];
    const result = await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      log: (line) => logs.push(line),
      open: database(["20261001000000"], [], executed),
    });
    expect(executed).toEqual(["create schema dogpack;"]);
    expect(result.applied).toBe(true);
    expect(readdirSync(product.paths.migrationsDir)).toEqual([FIRST]);
    expect(logs.join("\n")).toMatch(/missing schema dogpack/);
  });

  it("handles only the schema that is missing when several are configured", async () => {
    const product = makeProduct({
      files: { [`supabase/migrations/${FIRST}`]: CREATE },
    });
    product.config.supabase.schemas = ["dogpack", "extra"];
    const executed: string[] = [];
    const { run, calls } = liveRunner(product.root, "create schema extra;");
    const logs: string[] = [];
    await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      log: (line) => logs.push(line),
      open: database(["20261001000000"], ["dogpack"], executed),
    });
    expect(calls[0]?.args).toContain("dogpack,extra");
    expect(executed).toEqual(["create schema extra;"]);
    // Nothing is reverted and the record stays: no full re-create to collide.
    expect(verbs(calls)).toEqual(["db diff", "db schema"]);
    expect(readdirSync(product.paths.migrationsDir)).toEqual([FIRST]);
    expect(logs.join("\n")).toMatch(/missing schema extra/);
  });

  it("a missing ledger table does not rebuild: the record stays and the ledger is rewritten", async () => {
    const product = withRecord();
    const executed: string[] = [];
    const { run, calls } = liveRunner(product.root, "");
    const logs: string[] = [];
    const result = await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      log: (line) => logs.push(line),
      open: database(null, ["dogpack"], executed),
    });
    expect(executed).toEqual([]);
    expect(result.applied).toBe(false);
    expect(verbs(calls)).toEqual(["db diff", "migration repair", "db schema"]);
    expect(calls[1]?.args).toEqual([
      "migration",
      "repair",
      "--status",
      "applied",
      "--db-url",
      LOCAL.dbUrl,
      "20261001000000",
    ]);
    expect(readdirSync(product.paths.migrationsDir)).toEqual([FIRST]);
    expect(logs.join("\n")).toMatch(/no migration history table/);
    expect(logs.join("\n")).toMatch(/already matches/);
  });

  it("an unreadable ledger is not read as 'start over' either", async () => {
    const product = withRecord();
    const { run, calls } = liveRunner(product.root, "");
    const logs: string[] = [];
    await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      log: (line) => logs.push(line),
      open: database(new Error("permission denied"), ["dogpack"]),
    });
    expect(verbs(calls)).toEqual(["db diff", "db schema"]);
    expect(readdirSync(product.paths.migrationsDir)).toEqual([FIRST]);
    expect(logs.join("\n")).toMatch(/Could not read the migration history/);
  });

  it("marks a record migration the ledger lacks as applied once the database holds it", async () => {
    const product = withRecord();
    const { run, calls } = liveRunner(product.root, RESTORE);
    await dbSync(product, CLI, HOSTED, run, {
      yes: false,
      open: database([], []),
    });
    // The restore ran first; only then is the record called applied.
    expect(verbs(calls)).toEqual(["db diff", "migration repair", "db schema"]);
    expect(calls[1]?.args.slice(2, 4)).toEqual(["--status", "applied"]);
  });

  it("applies the new migration after restoring, in one sync", async () => {
    const product = withRecord();
    const { run, calls } = liveRunner(product.root, RESTORE, CREATE);
    const result = await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      open: database(["20261001000000"], ["dogpack"]),
    });
    expect(result.migration).toBe("20261011120000_devtools_sync.sql");
    expect(verbs(calls)).toEqual(["db diff", "db schema", "migration up"]);
  });

  it("asks before a restore that drops something, and --yes skips the question", async () => {
    const drop = `${RESTORE}drop table dogpack.stray;\n`;
    const refused = withRecord();
    const executed: string[] = [];
    await expect(
      dbSync(refused, CLI, LOCAL, liveRunner(refused.root, drop).run, {
        yes: false,
        open: database(["20261001000000"], ["dogpack"], executed),
      }),
    ).rejects.toThrow(/--yes/);
    expect(executed).toEqual([]);

    const confirm = vi.fn().mockResolvedValue(true);
    const asked = withRecord();
    await dbSync(asked, CLI, LOCAL, liveRunner(asked.root, drop).run, {
      yes: false,
      confirmDestructive: confirm,
      open: database(["20261001000000"], ["dogpack"], executed),
    });
    expect(confirm).toHaveBeenCalledOnce();
    expect(executed).toHaveLength(1);

    const forced = withRecord();
    const result = await dbSync(
      forced,
      CLI,
      LOCAL,
      liveRunner(forced.root, drop).run,
      { yes: true, open: database(["20261001000000"], ["dogpack"], executed) },
    );
    expect(executed).toHaveLength(2);
    expect(result.destructive).toHaveLength(1);
  });

  it("fails clearly when the restore SQL does not run", async () => {
    const product = withRecord();
    const open = database(["20261001000000"], ["dogpack"]);
    const session = open("x");
    session.exec = () => Promise.reject(new Error("syntax error"));
    await expect(
      dbSync(product, CLI, LOCAL, liveRunner(product.root, RESTORE).run, {
        yes: false,
        open: () => session,
      }),
    ).rejects.toThrow(/Could not restore/);
  });

  it("fails clearly when the comparison cannot run or prints nothing readable", async () => {
    const product = withRecord();
    const failing = recordingRunner(({ args }) =>
      args[1] === "diff" ? { code: 1, stderr: "boom" } : undefined,
    );
    await expect(
      dbSync(product, CLI, LOCAL, failing.run, {
        yes: false,
        open: database(["20261001000000"], ["dogpack"]),
      }),
    ).rejects.toThrow(/Could not compare/);
    const garbled = recordingRunner(({ args }) =>
      args[1] === "diff" ? { stdout: "no json here" } : undefined,
    );
    await expect(
      dbSync(product, CLI, LOCAL, garbled.run, {
        yes: false,
        open: database(["20261001000000"], ["dogpack"]),
      }),
    ).rejects.toThrow(/Could not read the result/);
  });

  it("retries the comparison once when the shadow container fails to start", async () => {
    const product = withRecord();
    let tries = 0;
    const { run, calls } = recordingRunner(({ args }) => {
      if (args[1] === "diff") {
        tries += 1;
        return tries === 1
          ? { code: 1, stderr: "error running container: exit 1" }
          : { stdout: diffOutput("") };
      }
      return undefined;
    });
    await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      open: database(["20261001000000"], ["dogpack"]),
    });
    expect(verbs(calls)).toEqual(["db diff", "db diff", "db schema"]);
  });

  it("does not compare on a first setup: no record, nothing said", async () => {
    const product = makeProduct();
    const logs: string[] = [];
    const { run, calls } = liveRunner(product.root, "", CREATE);
    await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      log: (line) => logs.push(line),
      open: database(null, []),
    });
    expect(verbs(calls)).toEqual(["db schema", "migration up"]);
    expect(logs.join("\n")).not.toMatch(/out of date|missing|history/);
  });

  it("carries on with the local record when the database cannot be asked", async () => {
    const product = withRecord();
    const { run, calls } = runnerThatGenerates(product.root, null);
    const logs: string[] = [];
    const result = await dbSync(product, CLI, HOSTED, run, {
      yes: false,
      log: (line) => logs.push(line),
      open: () => {
        throw new Error("connection refused");
      },
    });
    expect(result.migration).toBeNull();
    expect(verbs(calls)).toEqual(["db schema"]);
    expect(logs.join("\n")).toMatch(/Could not check/);
  });

  it("names the comparison in a dry run", async () => {
    const product = withRecord();
    const { run, calls } = recordingRunner();
    const lines: string[] = [];
    await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      dryRun: true,
      log: (line) => lines.push(line),
      open: database(null, []),
    });
    expect(calls).toEqual([]);
    expect(lines.join("\n")).toContain("db diff --from local --to migrations");
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

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SqlSession } from "./dev-data.js";
import * as real from "./drift.fixtures.js";
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
      restored: [],
      extras: [],
      compared: false,
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

// ── the live comparison ─────────────────────────────────────────────────────

const RECORD = {
  "supabase/migrations/20261001000000_first.sql": CREATE,
};

function fakeSession(
  options: {
    ledger?: string[] | null;
    existing?: string[];
    failOn?: "appliedMigrations" | "exec";
  } = {},
) {
  const executed: string[] = [];
  const session = {
    appliedMigrations: () =>
      options.failOn === "appliedMigrations"
        ? Promise.reject(
            new Error(`password authentication failed for ${HOSTED.dbUrl}`),
          )
        : Promise.resolve(
            options.ledger === undefined ? ["20261001000000"] : options.ledger,
          ),
    existingObjects: () => Promise.resolve(new Set(options.existing ?? [])),
    exec: (sql: string) => {
      if (options.failOn === "exec") return Promise.reject(new Error("boom"));
      executed.push(sql);
      return Promise.resolve();
    },
    close: () => Promise.resolve(),
  } as unknown as SqlSession;
  return { session, executed };
}

/** A runner whose `db diff` answers with `diff`, and whose declarative sync finds nothing. */
function liveRunner(
  diff: string,
  extra: Parameters<typeof recordingRunner>[0] = () => undefined,
) {
  return recordingRunner((call) => {
    if (call.args[0] === "db" && call.args[1] === "diff") {
      return {
        stdout: `Applying migration x...\n${JSON.stringify({ diff })}\n`,
      };
    }
    if (call.args.includes("declarative"))
      return { stdout: "No schema changes found" };
    return extra(call);
  });
}

describe("dbSync, comparing the live database", () => {
  it("says the database matches only after a comparison that ran and found nothing", async () => {
    const product = makeProduct({ files: RECORD });
    const { run, calls } = liveRunner("");
    const { session } = fakeSession();
    const lines: string[] = [];
    const result = await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      open: () => session,
      log: (line) => lines.push(line),
    });
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
    expect(lines).toContain("The database already matches supabase/schemas.");
    expect(result.compared).toBe(true);
    expect(result.applied).toBe(false);
  });

  it("never says it matches when it could not compare", async () => {
    const product = makeProduct({ files: RECORD });
    const { run } = liveRunner("");
    const lines: string[] = [];
    const result = await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      log: (line) => lines.push(line),
    });
    expect(result.compared).toBe(false);
    expect(lines.join("\n")).not.toMatch(/matches/);
  });

  it("fails, without saying it matches, when the diff cannot run, and keeps the password out of the message", async () => {
    const product = makeProduct({ files: RECORD });
    const { run } = recordingRunner(({ args }) =>
      args[1] === "diff"
        ? {
            code: 1,
            stdout: JSON.stringify({
              _tag: "Error",
              error: {
                message: `failed to connect to ${HOSTED.dbUrl}: password authentication failed`,
              },
            }),
          }
        : undefined,
    );
    const lines: string[] = [];
    const error = await dbSync(product, CLI, HOSTED, run, {
      yes: false,
      open: () => fakeSession().session,
      log: (line) => lines.push(line),
    }).catch((err: unknown) => err as SyncError);
    expect(error).toBeInstanceOf(SyncError);
    const text = `${error.message}\n${error.output}`;
    expect(text).toContain("not checked against supabase/schemas");
    expect(text).not.toMatch(/matches/);
    expect(text).not.toContain(":pw@");
    expect(text).toContain("<DB_URL>");
    expect(lines.join("\n")).not.toMatch(/matches/);
  });

  it("fails when the database cannot be reached, never trusting the record", async () => {
    const product = makeProduct({ files: RECORD });
    const { run, calls } = liveRunner("");
    const error = await dbSync(product, CLI, HOSTED, run, {
      yes: false,
      open: () => fakeSession({ failOn: "appliedMigrations" }).session,
    }).catch((err: unknown) => err as SyncError);
    expect(error).toBeInstanceOf(SyncError);
    expect(`${error.message}${error.output}`).not.toContain(HOSTED.dbUrl);
    expect(`${error.message}${error.output}`).not.toContain("pw@");
    expect(calls).toEqual([]);
  });

  it("recreates what is missing with only additive SQL, and rewrites a missing ledger from the record", async () => {
    const product = makeProduct({ files: RECORD });
    const { run, calls } = liveRunner(real.dropTable);
    const { session, executed } = fakeSession({ ledger: null });
    const lines: string[] = [];
    const result = await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      open: () => session,
      log: (line) => lines.push(line),
    });
    expect(result.applied).toBe(true);
    expect(result.restored).toContain('table "dogdays"."userPlanDraftCourses"');
    expect(executed).toHaveLength(1);
    expect(executed[0]).toContain("CREATE TABLE");
    expect(executed[0]).not.toMatch(/\bDROP\b/);
    const repair = calls.find((c) => c.args[1] === "repair");
    expect(repair?.args).toEqual([
      "migration",
      "repair",
      "--status",
      "applied",
      "--db-url",
      LOCAL.dbUrl,
      "20261001000000",
    ]);
    expect(lines.join("\n")).not.toMatch(/matches/);
  });

  it("lists extras as warnings, restores nothing, and still says it matches", async () => {
    const product = makeProduct({ files: RECORD });
    const { run } = liveRunner(real.extras);
    const { session, executed } = fakeSession();
    const lines: string[] = [];
    const warnings: string[] = [];
    const result = await dbSync(product, CLI, LOCAL, run, {
      yes: true,
      open: () => session,
      log: (line) => lines.push(line),
      warn: (line) => warnings.push(line),
    });
    expect(executed).toEqual([]);
    expect(result.extras.length).toBeGreaterThan(3);
    expect(warnings.join("\n")).toContain('table "dogdays"."member_extra"');
    expect(warnings.join("\n")).toContain("devtools db sync --rebuild");
    expect(warnings.join("\n")).toContain("devtools dev-data");
    expect(lines.join("\n")).toMatch(
      /matches supabase\/schemas, with \d+ extra/,
    );
  });

  it("points a hosted project at the dashboard reset, not --rebuild", async () => {
    const product = makeProduct({ files: RECORD });
    const { run } = liveRunner(real.extras);
    const warnings: string[] = [];
    await dbSync(product, CLI, HOSTED, run, {
      yes: false,
      open: () => fakeSession().session,
      warn: (line) => warnings.push(line),
    });
    expect(warnings.join("\n")).toContain(
      "reset the project from its dashboard",
    );
    expect(warnings.join("\n")).toContain(
      "devtools db sync` and `devtools dev-data",
    );
  });

  it("with --strict fails on extras and changes nothing", async () => {
    const product = makeProduct({ files: RECORD });
    const { run, calls } = liveRunner(real.extras);
    const { session, executed } = fakeSession();
    const error = await dbSync(product, CLI, LOCAL, run, {
      yes: true,
      strict: true,
      open: () => session,
    }).catch((err: unknown) => err as SyncError);
    expect(error).toBeInstanceOf(SyncError);
    expect(error.output).toContain('table "dogdays"."member_extra"');
    expect(executed).toEqual([]);
    expect(calls.some((c) => c.args.includes("declarative"))).toBe(false);
  });

  it("refuses a conflict, with or without --yes or --strict, and changes nothing", async () => {
    for (const flags of [{}, { yes: true }, { strict: true }]) {
      const product = makeProduct({ files: RECORD });
      const { run, calls } = liveRunner(
        real.dropTable + "\n\n" + real.columnType,
      );
      const { session, executed } = fakeSession();
      const error = await dbSync(product, CLI, LOCAL, run, {
        yes: false,
        ...flags,
        open: () => session,
      }).catch((err: unknown) => err as SyncError);
      expect(error).toBeInstanceOf(SyncError);
      expect(error.message).toContain("differently from supabase/schemas");
      expect(error.output).toContain('"minCreditHours"');
      expect(error.output).toContain("--rebuild");
      expect(executed).toEqual([]);
      expect(
        calls.some((c) => c.args[1] === "repair" || c.args.includes("up")),
      ).toBe(false);
    }
  });

  it("still applies a pulled schema change, with the usual --yes question, while extras sit untouched", async () => {
    const product = makeProduct({ files: RECORD });
    const drop = "alter table dogpack.sessions drop column old;\n";
    const { run, calls } = liveRunner(real.extras);
    // The declarative sync writes the pulled change as a new migration.
    const wrapped = async (...args: Parameters<typeof run>) => {
      if (args[1].includes("declarative")) {
        writeFiles(product.root, {
          "supabase/migrations/20261011120000_devtools_sync.sql": drop,
        });
      }
      return run(...args);
    };
    const { session, executed } = fakeSession();
    await expect(
      dbSync(product, CLI, LOCAL, wrapped, { yes: false, open: () => session }),
    ).rejects.toThrow(/--yes/);
    const result = await dbSync(product, CLI, LOCAL, wrapped, {
      yes: true,
      open: () => session,
    });
    expect(result.migration).toBe("20261011120000_devtools_sync.sql");
    expect(executed).toEqual([]);
    expect(calls.some((c) => c.args.join(" ") === "migration up --local")).toBe(
      true,
    );
  });

  it("shows the live diff in a dry run, with the whole command and no password", async () => {
    const product = makeProduct({ files: RECORD });
    const { run, calls } = recordingRunner();
    const lines: string[] = [];
    await dbSync(product, CLI, HOSTED, run, {
      yes: false,
      dryRun: true,
      open: () => fakeSession().session,
      log: (line) => lines.push(line),
    });
    expect(calls).toEqual([]);
    const text = lines.join("\n");
    expect(text).toContain(
      'supabase db diff --from "<DB_URL>" --to migrations --use-pg-delta',
    );
    expect(text).not.toContain("pw@");
  });
});

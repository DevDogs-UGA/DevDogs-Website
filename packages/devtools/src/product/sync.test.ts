import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SqlSession } from "./dev-data.js";
import type { LivePrivileges } from "./drift.js";
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
    columnTypes?: Map<string, string>;
    privileges?: LivePrivileges;
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
    columnTypes: () => Promise.resolve(options.columnTypes ?? new Map()),
    privileges: () => Promise.resolve(options.privileges ?? new Map()),
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

describe("dbSync, what this target has applied", () => {
  const PENDING = "supabase/migrations/20261011120000_devtools_sync.sql";
  const PENDING_SQL =
    "alter table dogpack.sessions drop column pinned;\nalter table dogpack.sessions add column color text;\n";

  /** The names in `supabase/migrations` at the moment each command ran. */
  function watching(product: ReturnType<typeof makeProduct>) {
    const seen: { command: string; files: string[] }[] = [];
    const base = liveRunner("");
    const run: typeof base.run = (command, args, options) => {
      seen.push({
        command: args.slice(0, 2).join(" "),
        files: readdirSync(product.paths.migrationsDir),
      });
      return base.run(command, args, options);
    };
    return { run, calls: base.calls, seen };
  }

  it("treats a migration that was written but never applied as pending, not as already applied", async () => {
    const product = makeProduct({
      files: { ...RECORD, [PENDING]: PENDING_SQL },
    });
    const { run, calls, seen } = watching(product);
    const { session, executed } = fakeSession({ ledger: ["20261001000000"] });
    const open = () => session;

    // Without --yes the drop is refused, and the file stays for next time.
    await expect(
      dbSync(product, CLI, LOCAL, run, { yes: false, open }),
    ).rejects.toThrow(/--yes/);
    expect(existsSync(join(product.root, PENDING))).toBe(true);

    const result = await dbSync(product, CLI, LOCAL, run, { yes: true, open });

    // Never marked applied: the ledger repair did not list it.
    expect(calls.some((c) => c.args[1] === "repair")).toBe(false);
    // The live diff ran against what was applied, without the pending file.
    const diff = seen.find((c) => c.command === "db diff");
    expect(diff?.files).toEqual(["20261001000000_first.sql"]);
    // It went through the normal path: applied by migration up, reported.
    expect(calls.some((c) => c.args.join(" ") === "migration up --local")).toBe(
      true,
    );
    expect(result.migration).toBe("20261011120000_devtools_sync.sql");
    expect(result.applied).toBe(true);
    expect(result.destructive).toEqual([
      "alter table dogpack.sessions drop column pinned",
    ]);
    // Nothing was run by hand against the database, and the file is back.
    expect(executed).toEqual([]);
    expect(existsSync(join(product.root, PENDING))).toBe(true);
    const record = JSON.parse(
      readFileSync(join(product.root, ".devtools", "record.json"), "utf8"),
    ) as { target: string; applied: string[] };
    expect(record).toEqual({
      target: "local",
      applied: ["20261001000000", "20261011120000"],
    });
  });

  it("does not say the database matches while a migration is still pending", async () => {
    const product = makeProduct({
      files: { ...RECORD, [PENDING]: PENDING_SQL },
    });
    const { run } = watching(product);
    const lines: string[] = [];
    await dbSync(product, CLI, LOCAL, run, {
      yes: true,
      open: () => fakeSession({ ledger: ["20261001000000"] }).session,
      log: (line) => lines.push(line),
    });
    expect(lines.join("\n")).not.toMatch(/matches/);
    expect(lines.join("\n")).toContain(
      "Applying 20261011120000_devtools_sync.sql",
    );
  });

  it("still rewrites a lost ledger from the files this target had applied, and only those", async () => {
    const product = makeProduct({ files: RECORD });
    const first = watching(product);
    // First sync notes what the local stack has applied.
    await dbSync(product, CLI, LOCAL, first.run, {
      yes: true,
      open: () => fakeSession().session,
    });
    writeFiles(product.root, { [PENDING]: PENDING_SQL });
    const { run, calls } = watching(product);
    await dbSync(product, CLI, LOCAL, run, {
      yes: true,
      open: () => fakeSession({ ledger: null }).session,
    });
    const repair = calls.find((c) => c.args[1] === "repair");
    expect(repair?.args.slice(-1)).toEqual(["20261001000000"]);
  });

  it("puts back a migration a killed sync had set aside", async () => {
    const product = makeProduct({ files: RECORD });
    writeFiles(product.root, { ".devtools/pending/20261011120000_x.sql": "x" });
    const { run } = watching(product);
    await dbSync(product, CLI, LOCAL, run, {
      yes: true,
      open: () => fakeSession().session,
    });
    expect(readdirSync(product.paths.migrationsDir)).toContain(
      "20261011120000_x.sql",
    );
  });

  it("does not use the local stack's record as a hosted project's history", async () => {
    const product = makeProduct();
    // 1. A local sync writes a migration (which drops nothing) and records it.
    const local = runnerThatGenerates(product.root, CREATE);
    await dbSync(product, CLI, LOCAL, local.run, { yes: true });
    expect(readdirSync(product.paths.migrationsDir)).toEqual([
      "20261011120000_devtools_sync.sql",
    ]);

    // 2. The same checkout syncs a hosted project, which has its own history.
    const { run, calls } = recordingRunner(({ args }) => {
      if (args[1] === "fetch") {
        writeFiles(product.root, {
          "supabase/migrations/20260901000000_hosted.sql": CREATE,
        });
        return { stdout: "fetched" };
      }
      if (args[1] === "diff") {
        return { stdout: JSON.stringify({ diff: "" }) };
      }
      if (args.includes("declarative")) return { stdout: "No schema changes" };
      return undefined;
    });
    const lines: string[] = [];
    const result = await dbSync(product, CLI, HOSTED, run, {
      yes: false,
      open: () => fakeSession({ ledger: ["20260901000000"] }).session,
      log: (line) => lines.push(line),
    });
    expect(lines.join("\n")).toContain("record of another database (local)");
    expect(calls[0]?.args).toEqual([
      "migration",
      "fetch",
      "--db-url",
      HOSTED.dbUrl,
    ]);
    // The local file is gone: it is not pushed, repaired or diffed.
    expect(readdirSync(product.paths.migrationsDir)).toEqual([
      "20260901000000_hosted.sql",
    ]);
    expect(calls.some((c) => c.args[1] === "repair")).toBe(false);
    expect(calls.some((c) => c.args[0] === "db" && c.args[1] === "push")).toBe(
      false,
    );
    expect(result.migration).toBeNull();
    const record = JSON.parse(
      readFileSync(join(product.root, ".devtools", "record.json"), "utf8"),
    ) as { target: string };
    expect(record.target).toBe("hosted:zzzzzzzzzzzzzzzzzzzz");

    // 3. Back to the local stack: the hosted record is not its history either.
    const back = recordingRunner(({ args }) => {
      if (args[1] === "fetch") {
        writeFiles(product.root, {
          "supabase/migrations/20261001000000_local.sql": CREATE,
        });
        return { stdout: "fetched" };
      }
      if (args[1] === "diff") return { stdout: JSON.stringify({ diff: "" }) };
      if (args.includes("declarative")) return { stdout: "No schema changes" };
      return undefined;
    });
    await dbSync(product, CLI, LOCAL, back.run, {
      yes: false,
      open: () => fakeSession({ ledger: ["20261001000000"] }).session,
    });
    expect(back.calls[0]?.args).toEqual(["migration", "fetch", "--local"]);
    expect(readdirSync(product.paths.migrationsDir)).toEqual([
      "20261001000000_local.sql",
    ]);
  });
});

describe("dbSync, what the member changed", () => {
  it("refuses a likely column rename, naming both columns, and changes nothing", async () => {
    const product = makeProduct({ files: RECORD });
    const { run, calls } = liveRunner(real.columnRenamed);
    const { session, executed } = fakeSession({
      columnTypes: new Map([["dogdays.userPlanDrafts.campusInput", "text"]]),
    });
    const error = await dbSync(product, CLI, LOCAL, run, {
      yes: true,
      open: () => session,
    }).catch((err: unknown) => err as SyncError);
    expect(error).toBeInstanceOf(SyncError);
    expect(error.output).toContain('"inputCampus"');
    expect(error.output).toContain('"campusInput"');
    expect(error.output).toContain("rename");
    expect(executed).toEqual([]);
    expect(calls.some((c) => c.args.includes("up"))).toBe(false);
  });

  it("says a narrowed privilege was granted again, and does not say the database matches", async () => {
    const product = makeProduct({ files: RECORD });
    const { run } = liveRunner(real.privilegesNarrowed);
    const { session, executed } = fakeSession();
    const lines: string[] = [];
    const warnings: string[] = [];
    const result = await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      open: () => session,
      log: (line) => lines.push(line),
      warn: (line) => warnings.push(line),
    });
    expect(executed).toHaveLength(1);
    expect(executed[0]).toMatch(/^GRANT DELETE, SELECT/);
    expect(executed[0]).not.toMatch(/REVOKE/);
    expect(result.restored).toEqual([
      'privileges on "dogdays"."userPreferences"',
    ]);
    expect(result.applied).toBe(true);
    expect(warnings).toEqual([]);
    const text = lines.join("\n");
    expect(text).toContain('privileges on "dogdays"."userPreferences"');
    expect(text).toContain("privileges beyond that were not taken away");
    expect(text).not.toMatch(/matches/);
  });

  it("recreates a missing overload and lists the member's own as an extra, with signatures", async () => {
    const product = makeProduct({ files: RECORD });
    const { run } = liveRunner(real.overloadMissing);
    const { session, executed } = fakeSession({
      existing: [
        "function:dogdays.claim_legacy_data",
        "signature:dogdays.claim_legacy_data(integer)",
      ],
    });
    const warnings: string[] = [];
    const result = await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      open: () => session,
      warn: (line) => warnings.push(line),
    });
    expect(executed[0]).toContain(
      "CREATE OR REPLACE FUNCTION dogdays.claim_legacy_data()",
    );
    expect(executed[0]).not.toMatch(/DROP/);
    expect(result.restored).toEqual([
      'function "dogdays"."claim_legacy_data"()',
    ]);
    expect(warnings.join("\n")).toContain(
      'function "dogdays"."claim_legacy_data"(integer)',
    );
  });

  it("does not mistake an unreachable hosted database for a new project with no history", async () => {
    const product = makeProduct();
    const { run, calls } = recordingRunner(({ args }) =>
      args[1] === "fetch"
        ? { code: 1, stderr: "connection refused" }
        : undefined,
    );
    const error = await dbSync(product, CLI, HOSTED, run, {
      yes: false,
      open: () => fakeSession({ failOn: "appliedMigrations" }).session,
    }).catch((err: unknown) => err as SyncError);
    expect(error).toBeInstanceOf(SyncError);
    expect(error.message).toContain("Could not connect");
    expect(`${error.message}${error.output}`).not.toContain("pw@");
    expect(calls).toEqual([]);
  });

  it("restores the local stack's history when its folder is empty but the stack was migrated before", async () => {
    const product = makeProduct();
    const { run, calls } = recordingRunner(({ args }) => {
      if (args[1] === "fetch") {
        writeFiles(product.root, {
          "supabase/migrations/20261001000000_first.sql": CREATE,
        });
        return { stdout: "fetched" };
      }
      if (args[1] === "diff") return { stdout: JSON.stringify({ diff: "" }) };
      if (args.includes("declarative")) return { stdout: "No schema changes" };
      return undefined;
    });
    const result = await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      open: () => fakeSession({ ledger: ["20261001000000"] }).session,
    });
    expect(calls[0]?.args).toEqual(["migration", "fetch", "--local"]);
    expect(result.migration).toBeNull();
    expect(result.compared).toBe(true);
  });

  it("starts from the schema when the local stack has no history yet", async () => {
    const product = makeProduct();
    const { run, calls } = runnerThatGenerates(product.root, CREATE);
    await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      open: () => fakeSession({ ledger: null }).session,
    });
    expect(calls.some((c) => c.args[1] === "fetch")).toBe(false);
  });
});

describe("dbSync, privileges a member granted", () => {
  const DIFF =
    'REVOKE ALL ON TABLE "dogpack"."sessions" FROM "authenticated";\n\nGRANT DELETE, SELECT ON TABLE "dogpack"."sessions" TO "authenticated";\n';
  const privileges = (...privs: string[]): LivePrivileges =>
    new Map([
      ["dogpack.sessions", new Map([["authenticated", new Set(privs)]])],
    ]);

  it("keeps the member's TRUNCATE, and a second sync is a stable no-op", async () => {
    const product = makeProduct({ files: RECORD });
    const { session, executed } = fakeSession({
      privileges: privileges("DELETE", "SELECT", "TRUNCATE"),
    });
    for (let round = 0; round < 2; round++) {
      const { run, calls } = liveRunner(DIFF);
      const lines: string[] = [];
      const warnings: string[] = [];
      const result = await dbSync(product, CLI, LOCAL, run, {
        yes: false,
        open: () => session,
        log: (line) => lines.push(line),
        warn: (line) => warnings.push(line),
      });
      expect(result.applied).toBe(false);
      expect(result.restored).toEqual([]);
      expect(result.extras.map((e) => e.detail)).toEqual([
        "TRUNCATE granted to authenticated beyond what supabase/schemas grants",
      ]);
      expect(lines.join("\n")).not.toMatch(/creating|missing|now matches/);
      expect(warnings.join("\n")).toContain("TRUNCATE");
      expect(calls.some((c) => c.args[1] === "repair")).toBe(false);
    }
    expect(executed).toEqual([]);
  });

  it("fails --strict on it", async () => {
    const product = makeProduct({ files: RECORD });
    const { run } = liveRunner(DIFF);
    const error = await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      strict: true,
      open: () =>
        fakeSession({ privileges: privileges("DELETE", "SELECT", "TRUNCATE") })
          .session,
    }).catch((err: unknown) => err as SyncError);
    expect(error).toBeInstanceOf(SyncError);
    expect(error.output).toContain("TRUNCATE");
  });

  it("grants again just the privilege the schema defines and the database lacks", async () => {
    const product = makeProduct({ files: RECORD });
    const { run } = liveRunner(DIFF);
    const { session, executed } = fakeSession({
      privileges: privileges("SELECT"),
    });
    const result = await dbSync(product, CLI, LOCAL, run, {
      yes: false,
      open: () => session,
    });
    expect(executed).toEqual([
      'GRANT DELETE ON TABLE "dogpack"."sessions" TO "authenticated";',
    ]);
    expect(result.applied).toBe(true);
  });
});

describe("dbSync, migrations of unknown origin", () => {
  it("uses a hosted project's own history instead of files written for the local stack", async () => {
    // A checkout from before records, synced against the local stack first.
    const product = makeProduct({ files: RECORD });
    const { run, calls } = recordingRunner(({ args }) => {
      if (args[1] === "fetch") {
        writeFiles(product.root, {
          "supabase/migrations/20260901000000_hosted.sql": CREATE,
        });
        return { stdout: "fetched" };
      }
      if (args[1] === "diff") return { stdout: JSON.stringify({ diff: "" }) };
      if (args.includes("declarative")) return { stdout: "No schema changes" };
      return undefined;
    });
    await dbSync(product, CLI, HOSTED, run, {
      yes: false,
      open: () => fakeSession({ ledger: ["20260901000000"] }).session,
    });
    expect(calls[0]?.args).toEqual([
      "migration",
      "fetch",
      "--db-url",
      HOSTED.dbUrl,
    ]);
    expect(readdirSync(product.paths.migrationsDir)).toEqual([
      "20260901000000_hosted.sql",
    ]);
    expect(calls.some((c) => c.args[1] === "push")).toBe(false);
    const record = JSON.parse(
      readFileSync(join(product.root, ".devtools", "record.json"), "utf8"),
    ) as { target: string; applied: string[] };
    expect(record).toEqual({
      target: "hosted:zzzzzzzzzzzzzzzzzzzz",
      applied: ["20260901000000"],
    });
  });

  it("shows the real error when the project's history cannot be fetched", async () => {
    const product = makeProduct({ files: RECORD });
    const { run } = recordingRunner(({ args }) =>
      args[1] === "fetch"
        ? { code: 1, stderr: "Remote migration versions not found" }
        : undefined,
    );
    const error = await dbSync(product, CLI, HOSTED, run, {
      yes: false,
      open: () => fakeSession({ ledger: ["20260901000000"] }).session,
    }).catch((err: unknown) => err as SyncError);
    expect(error).toBeInstanceOf(SyncError);
    expect(error.output).toContain("Remote migration versions not found");
    expect(`${error.message}${error.output}`).not.toContain("--rebuild");
  });

  it("treats files as unknown for a hosted project with no history table", async () => {
    const product = makeProduct({ files: RECORD });
    const { run, calls } = recordingRunner(({ args }) =>
      args[1] === "fetch" ? { code: 1, stderr: "no history" } : undefined,
    );
    await dbSync(product, CLI, HOSTED, run, {
      yes: false,
      open: () => fakeSession({ ledger: null }).session,
    }).catch(() => undefined);
    expect(calls[0]?.args[1]).toBe("fetch");
    expect(calls.some((c) => c.args[1] === "repair")).toBe(false);
  });
});

describe("dbSync, no record and no ledger", () => {
  const PENDING = "supabase/migrations/20261011120000_devtools_sync.sql";

  it("refuses a pending DROP COLUMN instead of reading it as the member's extra", async () => {
    const product = makeProduct({
      files: {
        ...RECORD,
        [PENDING]: "alter table dogpack.sessions drop column pinned;\n",
      },
    });
    const { run, calls } = liveRunner("");
    const { session, executed } = fakeSession({ ledger: null });
    const error = await dbSync(product, CLI, LOCAL, run, {
      yes: true,
      open: () => session,
    }).catch((err: unknown) => err as SyncError);
    expect(error).toBeInstanceOf(SyncError);
    expect(error.message).toContain("cannot tell whether");
    expect(error.output).toContain("20261011120000_devtools_sync.sql");
    expect(calls).toEqual([]);
    expect(executed).toEqual([]);
    expect(readdirSync(product.paths.migrationsDir)).toHaveLength(2);
    expect(existsSync(join(product.root, ".devtools", "record.json"))).toBe(
      false,
    );
  });
});

describe("dbSync, an unreachable database", () => {
  it("leaves the local record and files exactly as they were", async () => {
    const product = makeProduct({ files: RECORD });
    const first = liveRunner("");
    await dbSync(product, CLI, LOCAL, first.run, {
      yes: false,
      open: () => fakeSession().session,
    });
    const recordPath = join(product.root, ".devtools", "record.json");
    const before = readFileSync(recordPath, "utf8");
    const { run, calls } = liveRunner("");
    const error = await dbSync(product, CLI, HOSTED, run, {
      yes: false,
      open: () => fakeSession({ failOn: "appliedMigrations" }).session,
    }).catch((err: unknown) => err as SyncError);
    expect(error).toBeInstanceOf(SyncError);
    expect(error.message).toContain("nothing was changed");
    expect(calls).toEqual([]);
    expect(readFileSync(recordPath, "utf8")).toBe(before);
    expect(readdirSync(product.paths.migrationsDir)).toEqual([
      "20261001000000_first.sql",
    ]);
  });
});

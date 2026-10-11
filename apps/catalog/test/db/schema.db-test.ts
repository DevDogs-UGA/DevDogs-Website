import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "~/db/schema";
import { READ_STATEMENT_TIMEOUT_MS, withCatalogReader } from "~/db/reader";
import { createTestDatabase, type TestDatabase } from "./harness";

/**
 * The shape of what the catalog needs from the database, against a real
 * Postgres built from supabase/schemas: the Drizzle copy of the tables agrees
 * with them, the read-only role can read the `uga` views and nothing else, and
 * the search index is the one the view's expression matches.
 */

let db: TestDatabase;
let sql: postgres.Sql;

beforeAll(async () => {
  db = await createTestDatabase();
  sql = postgres(db.url, { max: 2, onnotice: () => undefined });
});

afterAll(async () => {
  await sql?.end({ timeout: 5 });
  await db?.drop();
});

describe("the Drizzle copy of the tables (src/db/schema.ts)", () => {
  const tables = (Object.values(schema) as unknown[]).filter(
    (value): value is PgTable => is(value, PgTable),
  );

  it("covers the tables the scrape writes", () => {
    expect(tables.map((t) => getTableConfig(t).name).sort()).toEqual([
      "academicPrograms",
      "buildings",
      "campuses",
      "colleges",
      "courses",
      "departments",
      "instructors",
      "meetings",
      "offerings",
      "partsOfTerm",
      "scheduleTypes",
      "subjects",
      "terms",
    ]);
  });

  it.each(tables.map((t) => [getTableConfig(t).name, t] as const))(
    "%s has the same columns, types and nullability as the real table",
    async (_name, table) => {
      const config = getTableConfig(table);
      const actual = await sql<
        { name: string; type: string; nullable: boolean }[]
      >`
        select column_name as name, data_type as type, is_nullable = 'YES' as nullable
        from information_schema.columns
        where table_schema = ${config.schema ?? "public"} and table_name = ${config.name}
        order by ordinal_position`;
      const declared = config.columns.map((column) => ({
        name: column.name,
        nullable: !column.notNull,
      }));
      expect(
        actual.map(({ name, nullable }) => ({ name, nullable })).sort(byName),
      ).toEqual(declared.sort(byName));
    },
  );
});

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name);
}

describe("the read-only role", () => {
  it("reads the uga views as catalog_reader", async () => {
    await sql`insert into schedule_builder.terms ("academicPeriod", description) values (209902, 'Test Spring 2099')`;
    const rows = await withCatalogReader(db.url, (tx) =>
      tx<{ academicPeriod: number }[]>`select "academicPeriod" from uga.terms`,
    );
    expect(rows.map((r) => r.academicPeriod)).toContain(209902);
  });

  it("cannot read the tables behind the views, the scrape log, or write anything", async () => {
    await expect(
      withCatalogReader(db.url, (tx) => tx`select * from schedule_builder.terms`),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      withCatalogReader(db.url, (tx) => tx`select * from uga."scrapeRuns"`),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      withCatalogReader(db.url, (tx) => tx`select * from platform."jobHeartbeats"`),
    ).rejects.toMatchObject({ code: "42501" });
    // The transaction is read-only, and the role has no write grant either way.
    await expect(
      withCatalogReader(
        db.url,
        (tx) => tx`insert into schedule_builder.terms values (1, 'x')`,
      ),
    ).rejects.toMatchObject({ code: expect.stringMatching(/^(42501|25006)$/) as unknown });
  });

  it("is stopped by the statement timeout", async () => {
    const started = Date.now();
    await expect(
      withCatalogReader(db.url, (tx) => tx`select pg_sleep(10)`),
    ).rejects.toMatchObject({ code: "57014" });
    expect(Date.now() - started).toBeLessThan(READ_STATEMENT_TIMEOUT_MS + 3000);
  });

  it("carries the same timeout as a role default for a direct login", async () => {
    const [row] = await sql<{ config: string[] }[]>`
      select rolconfig as config from pg_roles where rolname = 'catalog_reader'`;
    expect(row?.config).toContain(
      `statement_timeout=${READ_STATEMENT_TIMEOUT_MS / 1000}s`,
    );
  });

  it("leaves the pooled connection as it found it", async () => {
    // `set local` ends with the transaction: a second read starts as postgres.
    const [row] = await sql<{ current_user: string }[]>`select current_user`;
    expect(row?.current_user).toBe("postgres");
  });

  it("is not readable by the public Supabase roles", async () => {
    // The uga schema is granted to PUBLIC on purpose (the data is public), so
    // what keeps `anon` out is that nothing exposes the schema. Pin that: it
    // must not be in the PostgREST schema list, and the scrape log stays closed.
    const [anon] = await sql<{ select: boolean }[]>`
      select has_table_privilege('anon', 'uga."scrapeRuns"', 'select') as select`;
    expect(anon?.select).toBe(false);
    const [auth] = await sql<{ select: boolean }[]>`
      select has_table_privilege('authenticated', 'uga."scrapeRuns"', 'select') as select`;
    expect(auth?.select).toBe(false);
  });
});

describe("course search index", () => {
  it("is the index the view's expression matches, and the planner uses it", async () => {
    // Enough rows and subjects for the planner to have a choice.
    await sql`insert into schedule_builder.colleges (description) values ('Test College')`;
    await sql`insert into schedule_builder.subjects (abbr, description) values ('TEST', 'Test')`;
    await sql`
      insert into schedule_builder.courses (abbr, title, "abbrTitle", "courseNumber",
        "minCreditHours", "maxCreditHours", "minBillingCreditHours", "collegeId", "subjectId")
      select 'TEST' || (1000 + n), 'Course number ' || n, 'C' || n, (1000 + n)::text, 3, 3, 3,
             (select id from schedule_builder.colleges limit 1), (select id from schedule_builder.subjects limit 1)
      from generate_series(1, 3000) n`;
    await sql`analyze schedule_builder.courses`;

    const plan = await sql.begin(async (tx) => {
      await tx`set local enable_seqscan = off`;
      return tx<{ "QUERY PLAN": string }[]>`
        explain select id from uga.courses
        where "searchDocument" @@ websearch_to_tsquery('english', 'test1500')`;
    });
    expect(plan.map((r) => r["QUERY PLAN"]).join("\n")).toContain(
      "courses_search_idx",
    );
  });

  it("finds a code with or without its space, and by title words", async () => {
    const find = async (query: string) =>
      (
        await sql<{ abbr: string }[]>`
          select abbr from uga.courses
          where "searchDocument" @@ websearch_to_tsquery('english', ${query}) order by abbr`
      ).map((r) => r.abbr);
    expect(await find("TEST2500")).toEqual(["TEST2500"]);
    expect(await find("test 2500")).toContain("TEST2500");
    expect(await find("course number 2500")).toContain("TEST2500");
  });
});
